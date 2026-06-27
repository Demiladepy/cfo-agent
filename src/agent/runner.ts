import { randomUUID } from "node:crypto";
import { logExternalCall, logger } from "../lib/logger.js";
import { isOk } from "../lib/result.js";
import type { LifiClient } from "../lifi/client.js";
import type { IndexClient } from "../index/client.js";
import type { OfframpClient } from "../offramp/client.js";
import type { FxService } from "../fx/rate.js";
import type { Wallet } from "../wallet/wallet.js";
import type { PolicyEngine } from "../policy/engine.js";
import type { MemoryStore } from "../memory/index.js";
import { insertEvent } from "../memory/index.js";
import { detectInjectionInToolResult } from "./prompt.js";

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

export type AgentTools = {
  wallet: Wallet;
  lifi: LifiClient;
  index: IndexClient;
  offramp: OfframpClient;
  fx: FxService;
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
  /** Caller-supplied fallback when Index balance MCP is unavailable */
  ngnBalanceNgn?: number;
};

async function resolveNgnFloat(
  tools: AgentTools,
  intent: SendNgnIntent,
): Promise<number> {
  const balance = await tools.index.getNgnBalance();
  if (isOk(balance)) {
    if (balance.value.simulated) {
      if (intent.ngnBalanceNgn !== undefined) {
        logger.warn(
          {
            indexBalance: balance.value.balanceNgn,
            callerBalance: intent.ngnBalanceNgn,
          },
          "Using caller-supplied NGN float fallback (Index balance simulated)",
        );
        return intent.ngnBalanceNgn;
      }
      logger.warn(
        { balanceNgn: balance.value.balanceNgn },
        "Using simulated Index NGN balance",
      );
    }
    return balance.value.balanceNgn;
  }

  if (intent.ngnBalanceNgn !== undefined) {
    logger.warn(
      { callerBalance: intent.ngnBalanceNgn },
      "Index balance read failed — using caller-supplied NGN float",
    );
    return intent.ngnBalanceNgn;
  }

  logger.warn("Index balance read failed — defaulting to ₦0 float");
  return 0;
}

/**
 * Canonical flow: send X NGN to Y — wallet → LI.FI → off-ramp → Index transfer.
 */
export async function executeSendNgnFlow(
  tools: AgentTools,
  intent: SendNgnIntent,
  dryRun: boolean,
): Promise<AgentAction[]> {
  const actions: AgentAction[] = [];

  await logExternalCall("agent", "sendNgnFlow", intent, async () => {
    let ngnAvailable = await resolveNgnFloat(tools, intent);

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

      const fx = await tools.fx.getUsdToNgn();
      const stablecoinMinor = String(shortfall * 1_000_000);

      const quote = await tools.lifi.quote({
        fromChainId: SEPOLIA_CHAIN_ID,
        toChainId: SEPOLIA_CHAIN_ID,
        fromToken: SEPOLIA_USDC,
        toToken: SEPOLIA_USDC,
        fromAmount: stablecoinMinor,
      });

      if (!isOk(quote)) {
        actions.push({
          type: "insufficient_funds",
          message: `LI.FI quote failed: ${quote.error.message}`,
        });
        return actions;
      }

      const notionalUsd = shortfall / fx.rate;
      const exec = await tools.lifi.execute(quote.value, notionalUsd, shortfall);
      if (!isOk(exec)) {
        actions.push({
          type: "insufficient_funds",
          message: `LI.FI execute failed: ${exec.error.message}`,
        });
        return actions;
      }

      actions.push({
        type: "report",
        message: `routed ${shortfall} NGN equivalent via LI.FI (simulated=${exec.value.simulated}, fx=${fx.rate} NGN/USD, source=${fx.source})`,
      });

      const offramp = await tools.offramp.convertToNgn({
        stablecoinAmount: quote.value.toAmount,
        stablecoinSymbol: "USDC",
        chainId: SEPOLIA_CHAIN_ID,
        targetNgn: shortfall,
        idempotencyKey: randomUUID(),
      });

      if (!isOk(offramp)) {
        actions.push({
          type: "insufficient_funds",
          message: `off-ramp failed: ${offramp.error.message}`,
        });
        return actions;
      }

      ngnAvailable += offramp.value.ngnAmount;
      actions.push({
        type: "report",
        message: `off-ramp topped up ₦${offramp.value.ngnAmount.toLocaleString()} (simulated=${offramp.value.simulated}) · float now ₦${ngnAvailable.toLocaleString()}`,
      });
    }

    if (ngnAvailable < intent.amountNgn) {
      actions.push({
        type: "insufficient_funds",
        message: `NGN float still short after routing: have ${ngnAvailable}, need ${intent.amountNgn}`,
      });
      return actions;
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
