import { appendAuditLog, insertEvent } from "../memory/index.js";
import {
  getPendingConfirmation,
  insertPendingConfirmation,
  isPendingConfirmationExpired,
  mergePendingConfirmationAction,
  updatePendingConfirmationStatus,
  type PendingConfirmationRow,
} from "../memory/pending-confirmations.js";
import { isKillSwitchActive } from "../policy/kill-switch.js";
import { createUsageContextFromStore } from "../policy/usage.js";
import type { PolicyAction, PolicyConfig } from "../policy/types.js";
import type { MemoryStore } from "../memory/index.js";
import type { ConfirmRequiredContext } from "../index/client.js";
import type { AgentAction } from "../agent/runner.js";
import { isOk } from "../lib/result.js";
import type { IndexClient } from "../index/client.js";
import type { TransferRequest } from "../index/types.js";

export type PendingSendNgnAction = {
  type: "send_ngn_transfer";
  transfer: TransferRequest;
  intent: {
    amountNgn: number;
    recipientId: string;
    recipientCategory: string;
  };
  priorActions?: AgentAction[];
  ngnBalanceNgn?: number;
};

export type PolicySnapshot = {
  decision: "confirm";
  reason: string;
  action: PolicyAction;
  caps: {
    perTxCapNgn: number;
    dailyCapNgn: number;
    weeklyCapNgn: number;
    confirmThresholdNgn: number;
    dailySpentNgn: number;
    weeklySpentNgn: number;
    wouldConsumeNgn: number;
    remainingDailyNgn: number;
    category?: string;
    categoryDailyCapNgn?: number;
    categoryDailySpentNgn?: number;
  };
};

export type ConfirmBridge = {
  readonly lastPendingId: string | null;
  clearLastPending: () => void;
  onConfirmRequired: (ctx: ConfirmRequiredContext) => Promise<boolean>;
  beginResume: (pendingId: string) => void;
  endResume: () => void;
};

export type ConfirmExecutionContext = {
  store: MemoryStore;
  dryRun: boolean;
  killSwitchPath: string;
  confirmBridge: ConfirmBridge | null;
  index: IndexClient;
};

export function buildPolicySnapshot(
  store: MemoryStore,
  policyConfig: PolicyConfig,
  policyAction: PolicyAction,
  reason: string,
): PolicySnapshot {
  const usage = createUsageContextFromStore(store);
  const category = policyAction.recipientCategory ?? policyAction.category;
  const dailySpentNgn = usage.sumDailyNgn();
  const categoryDailySpentNgn = category ? usage.sumDailyNgn(category) : undefined;

  return {
    decision: "confirm",
    reason,
    action: policyAction,
    caps: {
      perTxCapNgn: policyConfig.per_tx_cap_ngn,
      dailyCapNgn: policyConfig.daily_cap_ngn,
      weeklyCapNgn: policyConfig.weekly_cap_ngn,
      confirmThresholdNgn: policyConfig.confirm_threshold_ngn,
      dailySpentNgn,
      weeklySpentNgn: usage.sumWeeklyNgn(),
      wouldConsumeNgn: policyAction.notionalNgn,
      remainingDailyNgn: policyConfig.daily_cap_ngn - dailySpentNgn,
      ...(category ? { category } : {}),
      ...(category && policyConfig.category_caps?.[category]
        ? {
            categoryDailyCapNgn: policyConfig.category_caps[category].daily_ngn,
            categoryDailySpentNgn,
          }
        : {}),
    },
  };
}

export function createConfirmBridge(options: {
  store: MemoryStore;
  killSwitchPath: string;
  policyConfig: PolicyConfig;
}): ConfirmBridge {
  let lastPendingId: string | null = null;
  let resumePendingId: string | null = null;

  return {
    get lastPendingId() {
      return lastPendingId;
    },

    clearLastPending() {
      lastPendingId = null;
    },

    beginResume(pendingId: string) {
      resumePendingId = pendingId;
    },

    endResume() {
      resumePendingId = null;
    },

    async onConfirmRequired(ctx: ConfirmRequiredContext): Promise<boolean> {
      if (resumePendingId) {
        const approvedId = resumePendingId;
        resumePendingId = null;
        appendAuditLog(options.store, {
          action: "confirmation",
          decision: "allow",
          reason: "operator approved pending action",
          metadata: {
            auditSubtype: "confirmation_decided",
            pendingId: approvedId,
            operatorDecision: "approve",
          },
        });
        return true;
      }

      const policySnapshot = buildPolicySnapshot(
        options.store,
        options.policyConfig,
        ctx.policyAction,
        ctx.reason,
      );

      const transfer =
        "recipientCategory" in ctx.request
          ? (ctx.request as TransferRequest)
          : null;

      if (!transfer) {
        appendAuditLog(options.store, {
          action: "confirmation",
          decision: "deny",
          reason: "confirm flow only supports transfers in demo",
          metadata: {
            auditSubtype: "confirmation_decided",
            operatorDecision: "deny",
            spendCategory: ctx.spendCategory,
          },
        });
        return false;
      }

      const id = insertPendingConfirmation(options.store, {
        action: {
          type: "send_ngn_transfer",
          transfer,
          intent: {
            amountNgn: transfer.amountNgn,
            recipientId: transfer.recipientId,
            recipientCategory: transfer.recipientCategory,
          },
        } satisfies PendingSendNgnAction,
        policySnapshot,
      });

      lastPendingId = id;

      appendAuditLog(options.store, {
        action: "confirmation",
        decision: "confirm",
        reason: ctx.reason,
        metadata: {
          auditSubtype: "confirmation_requested",
          pendingId: id,
          policySnapshot,
          transfer,
        },
      });

      return false;
    },
  };
}

export function attachPriorActionsToPending(
  store: MemoryStore,
  pendingId: string,
  priorActions: AgentAction[],
  ngnBalanceNgn: number,
): void {
  mergePendingConfirmationAction(store, pendingId, {
    priorActions,
    ngnBalanceNgn,
  });
}

export function parsePendingForApi(row: PendingConfirmationRow): {
  id: string;
  status: string;
  reason: string;
  expiresAt: string;
  createdAt: string;
  action: PendingSendNgnAction;
  caps: PolicySnapshot["caps"];
} {
  const action = JSON.parse(row.action_json) as PendingSendNgnAction;
  const snapshot = JSON.parse(row.policy_snapshot_json) as PolicySnapshot;
  return {
    id: row.id,
    status: row.status,
    reason: snapshot.reason,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    action,
    caps: snapshot.caps,
  };
}

export async function resolvePendingConfirmation(
  context: ConfirmExecutionContext,
  pendingId: string,
  decision: "y" | "n",
): Promise<
  | { ok: true; reference: string; simulated: boolean; actions: AgentAction[] }
  | { ok: false; status: number; error: string; expired?: boolean }
> {
  const row = getPendingConfirmation(context.store, pendingId);
  if (!row) {
    return { ok: false, status: 404, error: "pending confirmation not found" };
  }

  if (row.status !== "pending") {
    return {
      ok: false,
      status: 409,
      error: `confirmation already ${row.status}`,
    };
  }

  if (isPendingConfirmationExpired(context.store, pendingId)) {
    updatePendingConfirmationStatus(context.store, pendingId, "expired");
    appendAuditLog(context.store, {
      action: "confirmation",
      decision: "deny",
      reason: "confirmation expired",
      metadata: {
        auditSubtype: "confirmation_expired",
        pendingId,
      },
    });
    return { ok: false, status: 410, error: "confirmation expired", expired: true };
  }

  if (decision === "n") {
    updatePendingConfirmationStatus(context.store, pendingId, "denied");
    appendAuditLog(context.store, {
      action: "confirmation",
      decision: "deny",
      reason: "operator denied pending action",
      metadata: {
        auditSubtype: "confirmation_decided",
        pendingId,
        operatorDecision: "deny",
      },
    });
    return { ok: false, status: 200, error: "operator denied" };
  }

  if (isKillSwitchActive(context.killSwitchPath)) {
    updatePendingConfirmationStatus(context.store, pendingId, "denied");
    appendAuditLog(context.store, {
      action: "confirmation",
      decision: "deny",
      reason: "kill switch is active",
      metadata: {
        auditSubtype: "confirmation_decided",
        pendingId,
        operatorDecision: "deny",
        killSwitch: true,
      },
    });
    return { ok: false, status: 403, error: "kill switch is active" };
  }

  const parsed = parsePendingForApi(row);
  if (parsed.action.type !== "send_ngn_transfer") {
    return { ok: false, status: 400, error: "unsupported pending action type" };
  }

  const bridge = context.confirmBridge;
  if (!bridge) {
    return { ok: false, status: 500, error: "confirm bridge not configured" };
  }

  bridge.beginResume(pendingId);
  let transferResult;
  try {
    transferResult = await context.index.transfer(parsed.action.transfer);
  } finally {
    bridge.endResume();
  }

  if (!isOk(transferResult)) {
    appendAuditLog(context.store, {
      action: "confirmation",
      decision: "deny",
      reason: transferResult.error.message,
      metadata: {
        auditSubtype: "confirmation_outcome",
        pendingId,
        operatorDecision: "approve",
        outcome: "failed",
        error: transferResult.error,
      },
    });
    return { ok: false, status: 400, error: transferResult.error.message };
  }

  updatePendingConfirmationStatus(context.store, pendingId, "approved");

  insertEvent(context.store, "agent.transfer", {
    amountNgn: parsed.action.intent.amountNgn,
    recipientId: parsed.action.intent.recipientId,
    reference: transferResult.value.reference,
    simulated: transferResult.value.simulated,
    dryRun: context.dryRun,
    confirmedVia: pendingId,
  });

  const actions: AgentAction[] = [
    ...(parsed.action.priorActions ?? []),
    {
      type: "transfer_complete",
      reference: transferResult.value.reference,
      simulated: transferResult.value.simulated,
    },
  ];

  appendAuditLog(context.store, {
    action: "confirmation",
    decision: "allow",
    reason: `transfer completed after approval · ref ${transferResult.value.reference}`,
    metadata: {
      auditSubtype: "confirmation_outcome",
      pendingId,
      operatorDecision: "approve",
      outcome: "completed",
      reference: transferResult.value.reference,
    },
  });

  return {
    ok: true,
    reference: transferResult.value.reference,
    simulated: transferResult.value.simulated,
    actions,
  };
}
