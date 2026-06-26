import { randomUUID } from "node:crypto";
import { logExternalCall } from "../lib/logger.js";
import { isOk } from "../lib/result.js";
import type { LifiClient } from "../lifi/client.js";
import type { IndexClient } from "../index/client.js";
import type { Wallet } from "../wallet/wallet.js";
import type { PolicyEngine } from "../policy/engine.js";
import type { MemoryStore } from "../memory/index.js";
import { insertEvent } from "../memory/index.js";
import { detectInjectionInToolResult } from "./prompt.js";

export type AgentTools = {
  wallet: Wallet;
  lifi: LifiClient;
  index: IndexClient;
  policy: PolicyEngine;
  memory: MemoryStore;
};

export type AgentAction =
  | { type: "report"; message: string }
  | { type: "injection_detected"; payload: string }
  | { type: "transfer_complete"; reference: string; simulated: boolean }
  | { type: "insufficient_funds"; message: string };

export type SendNgnIntent = {
  amountNgn: number;
  recipientId: string;
  recipientCategory: string;
  ngnBalanceNgn: number;
};

/**
 * Canonical flow: send X NGN to Y, routing from crypto if fiat short.
 */
export async function executeSendNgnFlow(
  tools: AgentTools,
  intent: SendNgnIntent,
  dryRun: boolean,
): Promise<AgentAction[]> {
  const actions: AgentAction[] = [];

  await logExternalCall("agent", "sendNgnFlow", intent, async () => {
    let ngnAvailable = intent.ngnBalanceNgn;

    if (ngnAvailable < intent.amountNgn) {
      const shortfall = intent.amountNgn - ngnAvailable;
      actions.push({
        type: "report",
        message: `NGN short by ${shortfall}; checking crypto liquidity`,
      });

      const balances = await tools.wallet.readBalances();
      if (!isOk(balances)) {
        actions.push({
          type: "insufficient_funds",
          message: "cannot read wallet balances",
        });
        return actions;
      }

      const quote = await tools.lifi.quote({
        fromChainId: 11155111,
        toChainId: 11155111,
        fromToken: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        toToken: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        fromAmount: String(shortfall * 1_000_000),
      });

      if (!isOk(quote)) {
        actions.push({
          type: "insufficient_funds",
          message: `LI.FI quote failed: ${quote.error.message}`,
        });
        return actions;
      }

      const exec = await tools.lifi.execute(
        quote.value,
        shortfall / 1500,
        shortfall,
      );
      if (!isOk(exec)) {
        actions.push({
          type: "insufficient_funds",
          message: `LI.FI execute failed: ${exec.error.message}`,
        });
        return actions;
      }

      actions.push({
        type: "report",
        message: `routed ${shortfall} NGN equivalent via LI.FI (simulated=${exec.value.simulated})`,
      });
      ngnAvailable = intent.amountNgn;
    }

    const transfer = await tools.index.transfer({
      recipientId: intent.recipientId,
      recipientCategory: intent.recipientCategory,
      amountNgn: intent.amountNgn,
      idempotencyKey: randomUUID(),
    });

    if (!isOk(transfer)) {
      actions.push({
        type: "insufficient_funds",
        message: `transfer failed: ${transfer.error.message}`,
      });
      return actions;
    }

    insertEvent(tools.memory, "agent.transfer", {
      amountNgn: intent.amountNgn,
      recipientId: intent.recipientId,
      reference: transfer.value.reference,
      simulated: transfer.value.simulated,
      dryRun,
    });

    actions.push({
      type: "transfer_complete",
      reference: transfer.value.reference,
      simulated: transfer.value.simulated,
    });

    return actions;
  });

  return actions;
}

export function processToolResult(
  toolName: string,
  result: string,
): AgentAction {
  if (detectInjectionInToolResult(result)) {
    return {
      type: "injection_detected",
      payload: `suspected injection in ${toolName} result: ${result.slice(0, 120)}`,
    };
  }
  return { type: "report", message: result };
}
