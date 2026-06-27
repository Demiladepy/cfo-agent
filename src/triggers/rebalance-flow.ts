import { randomUUID } from "node:crypto";
import { appendAuditLog, insertEvent } from "../memory/index.js";
import { insertPendingConfirmation } from "../memory/pending-confirmations.js";
import { buildPolicySnapshot } from "../confirm/bridge.js";
import { isOk } from "../lib/result.js";
import { logger } from "../lib/logger.js";
import type { AppTools } from "../app/create-tools.js";
import type { PolicyConfig } from "../policy/types.js";
import type { MemoryStore } from "../memory/index.js";

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

export type RebalanceFlowResult = {
  outcome: "float_sufficient" | "executed" | "simulated" | "denied" | "confirm_pending" | "error";
  detail: string;
  pendingId?: string;
  deficitNgn?: number;
};

export type RebalanceFlowOptions = {
  tools: AppTools;
  store: MemoryStore;
  policyConfig: PolicyConfig;
  targetNgnFloat: number;
  dryRun: boolean;
  skipPolicyGate?: boolean;
};

async function routeLiquidity(
  tools: AppTools,
  deficitNgn: number,
  dryRun: boolean,
): Promise<{ ok: true; reference: string; simulated: boolean } | { ok: false; detail: string }> {
  const fx = await tools.fx.getUsdToNgn();
  const stablecoinMinor = String(deficitNgn * 1_000_000);

  const quote = await tools.lifi.quote({
    fromChainId: SEPOLIA_CHAIN_ID,
    toChainId: SEPOLIA_CHAIN_ID,
    fromToken: SEPOLIA_USDC,
    toToken: SEPOLIA_USDC,
    fromAmount: stablecoinMinor,
  });

  if (!isOk(quote)) {
    return { ok: false, detail: `LI.FI quote failed: ${quote.error.message}` };
  }

  const notionalUsd = deficitNgn / fx.rate;

  if (dryRun) {
    insertEvent(tools.memory, "trigger.rebalance", {
      deficitNgn,
      routeId: quote.value.id,
      simulated: true,
    });
    return { ok: true, reference: `sim-${quote.value.id.slice(0, 8)}`, simulated: true };
  }

  const exec = await tools.lifi.execute(quote.value, notionalUsd, deficitNgn);
  if (!isOk(exec)) {
    return { ok: false, detail: `LI.FI execute failed: ${exec.error.message}` };
  }

  const offramp = await tools.offramp.convertToNgn({
    stablecoinAmount: quote.value.toAmount,
    stablecoinSymbol: "USDC",
    chainId: SEPOLIA_CHAIN_ID,
    targetNgn: deficitNgn,
    idempotencyKey: randomUUID(),
  });

  if (!isOk(offramp)) {
    return { ok: false, detail: `off-ramp failed: ${offramp.error.message}` };
  }

  insertEvent(tools.memory, "trigger.rebalance", {
    deficitNgn,
    routeId: quote.value.id,
    offrampRef: offramp.value.providerReference,
    ngnAmount: offramp.value.ngnAmount,
    simulated: offramp.value.simulated,
  });

  return {
    ok: true,
    reference: offramp.value.providerReference,
    simulated: offramp.value.simulated,
  };
}

export async function executeRebalanceTopup(
  options: RebalanceFlowOptions,
): Promise<RebalanceFlowResult> {
  const { tools, store, policyConfig, targetNgnFloat, dryRun } = options;

  const balanceResult = await tools.index.getNgnBalance();
  const balanceNgn = isOk(balanceResult) ? balanceResult.value.balanceNgn : 0;
  const deficit = targetNgnFloat - balanceNgn;

  if (deficit <= 0) {
    return {
      outcome: "float_sufficient",
      detail: `NGN float ₦${balanceNgn.toLocaleString()} meets target ₦${targetNgnFloat.toLocaleString()}`,
    };
  }

  if (!options.skipPolicyGate) {
    const policyAction = {
      kind: "offramp" as const,
      category: "offramp",
      notionalNgn: deficit,
    };
    const policyResult = tools.policy.evaluate(policyAction);
    if (!isOk(policyResult)) {
      return { outcome: "denied", detail: policyResult.error.message, deficitNgn: deficit };
    }

    if (policyResult.value.decision === "deny") {
      return {
        outcome: "denied",
        detail: policyResult.value.reason,
        deficitNgn: deficit,
      };
    }

    if (policyResult.value.decision === "confirm") {
      const snapshot = buildPolicySnapshot(
        store,
        policyConfig,
        policyAction,
        policyResult.value.reason,
      );
      const pendingId = insertPendingConfirmation(store, {
        action: {
          type: "rebalance_topup",
          deficitNgn: deficit,
          targetNgn: targetNgnFloat,
          balanceNgn,
        },
        policySnapshot: snapshot,
      });

      appendAuditLog(store, {
        action: "trigger.rebalance",
        decision: "confirm",
        reason: policyResult.value.reason,
        metadata: {
          auditSubtype: "trigger_rebalance_confirm",
          pendingId,
          deficitNgn: deficit,
        },
      });

      logger.warn(
        { pendingId, deficitNgn: deficit },
        "rebalance requires operator confirmation — pending confirmation created",
      );

      return {
        outcome: "confirm_pending",
        detail: policyResult.value.reason,
        pendingId,
        deficitNgn: deficit,
      };
    }
  }

  const routed = await routeLiquidity(tools, deficit, dryRun);
  if (!routed.ok) {
    return { outcome: "error", detail: routed.detail, deficitNgn: deficit };
  }

  appendAuditLog(store, {
    action: "trigger.rebalance",
    decision: "allow",
    reason: `topped up ₦${deficit.toLocaleString()} float${routed.simulated ? " (simulated)" : ""}`,
    metadata: {
      auditSubtype: "trigger_rebalance_outcome",
      reference: routed.reference,
      deficitNgn: deficit,
      simulated: routed.simulated,
    },
  });

  return {
    outcome: routed.simulated ? "simulated" : "executed",
    detail: `rebalance complete · ref ${routed.reference}`,
    deficitNgn: deficit,
  };
}
