import { logExternalCall } from "../lib/logger.js";
import { isLiveExecutionAllowed } from "../lib/execution.js";
import { err, ok, isOk, type Result } from "../lib/result.js";
import { isKillSwitchActive } from "../policy/kill-switch.js";
import type { PolicyEngine } from "../policy/engine.js";
import type { Env } from "../config/env.js";
import type { MemoryStore } from "../memory/index.js";
import {
  getIdempotencyReference,
  hasIdempotencyKey,
  recordIdempotencyKey,
} from "./idempotency.js";
import {
  airtimeRequestSchema,
  transferRequestSchema,
  type AirtimeRequest,
  type IndexError,
  type IndexMcpTools,
  type TransferRequest,
} from "./types.js";

export type IndexClientDeps = {
  mcp: IndexMcpTools;
  policy: PolicyEngine;
  store: MemoryStore;
  env: Pick<Env, "LIVE_EXECUTION">;
  dryRun: boolean;
  onConfirmRequired?: (reason: string) => Promise<boolean>;
};

function mapSpendAction(
  amountNgn: number,
  category: string,
  recipientId?: string,
) {
  return {
    kind: "spend" as const,
    notionalNgn: amountNgn,
    category,
    recipientId,
  };
}

export function createIndexClient(deps: IndexClientDeps) {
  async function purchaseAirtime(
    input: unknown,
  ): Promise<Result<{ reference: string; simulated: boolean }, IndexError>> {
    const parsed = airtimeRequestSchema.safeParse(input);
    if (!parsed.success) {
      return err({ code: "MCP_ERROR", message: parsed.error.message });
    }
    return executeSpend("airtime", parsed.data, () =>
      deps.mcp.purchaseAirtime(parsed.data),
    );
  }

  async function transfer(
    input: unknown,
  ): Promise<Result<{ reference: string; simulated: boolean }, IndexError>> {
    const parsed = transferRequestSchema.safeParse(input);
    if (!parsed.success) {
      return err({ code: "MCP_ERROR", message: parsed.error.message });
    }
    return executeSpend("transfer", parsed.data, () =>
      deps.mcp.transfer(parsed.data),
    );
  }

  async function executeSpend(
    category: string,
    req: AirtimeRequest | TransferRequest,
    mcpCall: () => ReturnType<IndexMcpTools["purchaseAirtime"]>,
  ): Promise<Result<{ reference: string; simulated: boolean }, IndexError>> {
    if (isKillSwitchActive()) {
      return err({ code: "KILL_SWITCH", message: "kill switch is active" });
    }

    if (hasIdempotencyKey(deps.store, req.idempotencyKey)) {
      const existing = getIdempotencyReference(deps.store, req.idempotencyKey);
      return err({
        code: "DUPLICATE",
        message: `duplicate idempotency key: ${req.idempotencyKey} (ref: ${existing})`,
      });
    }

    const policyAction =
      "recipientCategory" in req
        ? {
            kind: "transfer" as const,
            notionalNgn: req.amountNgn,
            recipientCategory: req.recipientCategory,
            recipientId: req.recipientId,
          }
        : mapSpendAction(req.amountNgn, category, req.phone);

    const policyResult = deps.policy.evaluate(policyAction);
    if (!isOk(policyResult)) {
      return err({ code: "POLICY_DENIED", message: policyResult.error.message });
    }
    if (policyResult.value.decision === "deny") {
      return err({
        code: "POLICY_DENIED",
        message: policyResult.value.reason,
      });
    }
    if (policyResult.value.decision === "confirm") {
      if (deps.onConfirmRequired) {
        const approved = await deps.onConfirmRequired(policyResult.value.reason);
        if (!approved) {
          return err({
            code: "CONFIRM_REQUIRED",
            message: `operator declined: ${policyResult.value.reason}`,
          });
        }
      } else {
        return err({
          code: "CONFIRM_REQUIRED",
          message: policyResult.value.reason,
        });
      }
    }

    if (deps.dryRun || !isLiveExecutionAllowed(deps.dryRun, deps.env)) {
      const reference = `dry-run-${req.idempotencyKey.slice(0, 8)}`;
      recordIdempotencyKey(deps.store, req.idempotencyKey, reference);
      await logExternalCall(
        "index",
        category,
        { ...req, dryRun: true },
        async () => ({ reference, simulated: true }),
      );
      return ok({ reference, simulated: true });
    }

    try {
      const result = await logExternalCall("index", category, req, mcpCall);
      if (!result.success || !result.reference) {
        return err({
          code: "MCP_ERROR",
          message: result.error ?? "index call failed",
        });
      }
      recordIdempotencyKey(deps.store, req.idempotencyKey, result.reference);
      return ok({ reference: result.reference, simulated: false });
    } catch (e) {
      return err({
        code: "MCP_ERROR",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { purchaseAirtime, transfer };
}

export type IndexClient = ReturnType<typeof createIndexClient>;

export function createMockIndexMcp(): IndexMcpTools {
  const seen = new Set<string>();
  return {
    async purchaseAirtime(req) {
      if (seen.has(req.idempotencyKey)) {
        return { success: false, error: "duplicate" };
      }
      seen.add(req.idempotencyKey);
      return {
        success: true,
        reference: `airtime-${req.idempotencyKey.slice(0, 8)}`,
      };
    },
    async transfer(req) {
      if (seen.has(req.idempotencyKey)) {
        return { success: false, error: "duplicate" };
      }
      seen.add(req.idempotencyKey);
      return {
        success: true,
        reference: `xfer-${req.idempotencyKey.slice(0, 8)}`,
      };
    },
  };
}
