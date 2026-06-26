import { logExternalCall } from "../lib/logger.js";
import { err, ok, isOk, type Result } from "../lib/result.js";
import { isKillSwitchActive } from "../policy/kill-switch.js";
import type { PolicyEngine } from "../policy/engine.js";
import { isLiveExecutionAllowed } from "../lib/execution.js";
import type { Env } from "../config/env.js";
import { loadLifiConfig } from "./config.js";
import { checkRouteSanity } from "./sanity.js";
import type {
  ExecuteResult,
  LifiConfig,
  LifiError,
  QuoteRequest,
  RouteQuote,
} from "./types.js";
import { quoteRequestSchema } from "./types.js";

export type LifiSdk = {
  getQuote: (req: QuoteRequest) => Promise<RouteQuote>;
  executeRoute: (routeId: string) => Promise<{ txHash: `0x${string}`; status: ExecuteResult["status"] }>;
};

function mapRouteToPolicyAction(route: RouteQuote, notionalNgn: number) {
  return {
    kind: "swap" as const,
    notionalNgn,
    cryptoAddress: route.toAddress,
  };
}

export type LifiClientDeps = {
  sdk: LifiSdk;
  policy: PolicyEngine;
  env: Pick<Env, "LIVE_EXECUTION" | "LIFI_CONFIG_PATH">;
  dryRun: boolean;
  notionalNgnForUsd?: (usd: number) => number;
};

export function createLifiClient(deps: LifiClientDeps) {
  const configPath = deps.env.LIFI_CONFIG_PATH ?? "config/lifi.example.yaml";
  const configResult = loadLifiConfig(configPath);
  if (!configResult.ok) {
    throw new Error(configResult.error.message);
  }
  const config: LifiConfig = configResult.value;

  async function quote(
    input: unknown,
  ): Promise<Result<RouteQuote, LifiError>> {
    const parsed = quoteRequestSchema.safeParse(input);
    if (!parsed.success) {
      return err({ code: "QUOTE_FAILED", message: parsed.error.message });
    }

    try {
      const route = await logExternalCall(
        "lifi",
        "getQuote",
        parsed.data,
        () => deps.sdk.getQuote(parsed.data),
      );
      return ok(route);
    } catch (e) {
      return err({
        code: "QUOTE_FAILED",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function execute(
    route: RouteQuote,
    notionalUsd: number,
    notionalNgn: number,
  ): Promise<Result<ExecuteResult, LifiError>> {
    if (isKillSwitchActive()) {
      return err({ code: "KILL_SWITCH", message: "kill switch is active" });
    }

    const sanity = checkRouteSanity(route, config, notionalUsd);
    if (!sanity.ok) {
      return err({ code: "SANITY_FAILED", message: sanity.reason });
    }

    const policyResult = deps.policy.evaluate(
      mapRouteToPolicyAction(route, notionalNgn),
    );
    if (!isOk(policyResult)) {
      return err({
        code: "POLICY_DENIED",
        message: policyResult.error.message,
      });
    }
    if (policyResult.value.decision === "deny") {
      return err({
        code: "POLICY_DENIED",
        message: policyResult.value.reason,
      });
    }
    if (policyResult.value.decision === "confirm") {
      return err({
        code: "POLICY_DENIED",
        message: `confirmation required: ${policyResult.value.reason}`,
      });
    }

    if (deps.dryRun || !isLiveExecutionAllowed(deps.dryRun, deps.env)) {
      const simulated = await logExternalCall(
        "lifi",
        "executeRoute",
        { routeId: route.id, dryRun: true },
        async () => ({
          routeId: route.id,
          txHash: `0x${"cd".repeat(32)}` as `0x${string}`,
          simulated: true,
          status: "DONE" as const,
        }),
      );
      return ok(simulated);
    }

    try {
      const executed = await logExternalCall(
        "lifi",
        "executeRoute",
        { routeId: route.id, live: true },
        () => deps.sdk.executeRoute(route.id),
      );
      return ok({
        routeId: route.id,
        txHash: executed.txHash,
        simulated: false,
        status: executed.status,
      });
    } catch (e) {
      return err({
        code: "EXECUTE_FAILED",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { quote, execute, config };
}

export type LifiClient = ReturnType<typeof createLifiClient>;
