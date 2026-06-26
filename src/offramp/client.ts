import { logExternalCall } from "../lib/logger.js";
import { err, ok, type Result } from "../lib/result.js";
import { isKillSwitchActive } from "../policy/kill-switch.js";
import type { PolicyEngine } from "../policy/engine.js";
import { isOk } from "../lib/result.js";
import { isLiveExecutionAllowed } from "../lib/execution.js";
import type { Env } from "../config/env.js";
import type { MemoryStore } from "../memory/index.js";
import { insertEvent } from "../memory/index.js";

export type OfframpRequest = {
  stablecoinAmount: string;
  stablecoinSymbol: string;
  chainId: number;
  targetNgn: number;
  idempotencyKey: string;
};

export type OfframpResult = {
  providerReference: string;
  ngnAmount: number;
  simulated: boolean;
};

export type OfframpError = {
  code: "POLICY_DENIED" | "KILL_SWITCH" | "PROVIDER_ERROR" | "DRY_RUN";
  message: string;
};

export type OfframpProvider = {
  name: string;
  convert: (req: OfframpRequest) => Promise<{ reference: string; ngnAmount: number }>;
};

export type OfframpClientDeps = {
  provider: OfframpProvider;
  policy: PolicyEngine;
  memory: MemoryStore;
  env: Pick<Env, "LIVE_EXECUTION">;
  dryRun: boolean;
};

export function createOfframpClient(deps: OfframpClientDeps) {
  async function execute(
    req: OfframpRequest,
  ): Promise<Result<OfframpResult, OfframpError>> {
    if (isKillSwitchActive()) {
      return err({ code: "KILL_SWITCH", message: "kill switch is active" });
    }

    const policyResult = deps.policy.evaluate({
      kind: "bridge",
      notionalNgn: req.targetNgn,
      cryptoAddress: "0x0000000000000000000000000000000000000001",
    });
    if (!isOk(policyResult)) {
      return err({ code: "POLICY_DENIED", message: policyResult.error.message });
    }
    if (policyResult.value.decision !== "allow") {
      return err({
        code: "POLICY_DENIED",
        message: policyResult.value.reason,
      });
    }

    if (deps.dryRun || !isLiveExecutionAllowed(deps.dryRun, deps.env)) {
      const reference = `offramp-dry-${req.idempotencyKey.slice(0, 8)}`;
      await logExternalCall("offramp", "convert", { ...req, dryRun: true }, async () => ({
        reference,
        ngnAmount: req.targetNgn,
      }));
      insertEvent(deps.memory, "offramp.convert", {
        ...req,
        reference,
        simulated: true,
        provider: deps.provider.name,
      });
      return ok({
        providerReference: reference,
        ngnAmount: req.targetNgn,
        simulated: true,
      });
    }

    try {
      const result = await logExternalCall(
        "offramp",
        "convert",
        req,
        () => deps.provider.convert(req),
      );
      insertEvent(deps.memory, "offramp.convert", {
        ...req,
        reference: result.reference,
        simulated: false,
        provider: deps.provider.name,
      });
      return ok({
        providerReference: result.reference,
        ngnAmount: result.ngnAmount,
        simulated: false,
      });
    } catch (e) {
      return err({
        code: "PROVIDER_ERROR",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { execute };
}

export function createMockOfframpProvider(name = "mock"): OfframpProvider {
  return {
    name,
    async convert(req) {
      return {
        reference: `mock-${req.idempotencyKey.slice(0, 8)}`,
        ngnAmount: req.targetNgn,
      };
    },
  };
}
