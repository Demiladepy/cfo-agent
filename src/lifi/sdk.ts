import {
  createConfig,
  convertQuoteToRoute,
  executeRoute as lifiExecuteRoute,
  getQuote as lifiGetQuote,
  EVM,
  type Route,
  type LiFiStep,
  type Step,
} from "@lifi/sdk";
import type { WalletClient } from "viem";
import type { LifiSdk } from "./client.js";
import type { QuoteRequest, RouteQuote } from "./types.js";

export type CreateLifiSdkOptions = {
  integrator: string;
  fromAddress?: `0x${string}`;
  getWalletClient?: () => Promise<WalletClient>;
};

const routeCache = new Map<string, Route>();

let configured = false;

function ensureConfig(integrator: string, getWalletClient?: () => Promise<WalletClient>): void {
  if (configured) return;
  const providers = getWalletClient ? [EVM({ getWalletClient })] : [];
  createConfig({
    integrator,
    preloadChains: false,
    providers,
  });
  configured = true;
}

function sumUsd(costs?: Array<{ amountUSD?: string }>): number {
  if (!costs?.length) return 0;
  return costs.reduce((sum, c) => sum + Number(c.amountUSD ?? 0), 0);
}

function mapStepToRouteQuote(step: LiFiStep): RouteQuote {
  const hops = step.includedSteps?.length ?? 1;
  const slippage = step.action.slippage ?? 0.003;
  return {
    id: step.id,
    fromAmount: step.action.fromAmount,
    toAmount: step.estimate.toAmount,
    toAmountMin: step.estimate.toAmountMin,
    gasCostUsd: sumUsd(step.estimate.gasCosts),
    feeCostUsd: sumUsd(step.estimate.feeCosts),
    slippageBps: Math.round(slippage * 10_000),
    hops,
    steps: (step.includedSteps ?? [step]).map((s: Step) => ({
      tool: ("toolDetails" in s && s.toolDetails?.key) ? s.toolDetails.key : (s.type ?? "swap"),
      fromChainId: s.action.fromToken.chainId,
      toChainId: s.action.toToken.chainId,
      feeUsd: sumUsd(s.estimate.feeCosts),
    })),
    createdAt: Date.now(),
    toAddress: (step.action.toAddress ?? step.action.fromAddress) as string,
  };
}

export function createLifiSdk(options: CreateLifiSdkOptions): LifiSdk {
  ensureConfig(options.integrator, options.getWalletClient);

  return {
    async getQuote(req: QuoteRequest): Promise<RouteQuote> {
      const fromAddress =
        req.fromAddress ??
        options.fromAddress ??
        ("0x0000000000000000000000000000000000000001" as `0x${string}`);

      const step = await lifiGetQuote({
        fromChain: req.fromChainId,
        toChain: req.toChainId,
        fromToken: req.fromToken,
        toToken: req.toToken,
        fromAmount: req.fromAmount,
        fromAddress,
        toAddress: req.toAddress ?? fromAddress,
      });

      const route = convertQuoteToRoute(step);
      routeCache.set(step.id, route);
      return mapStepToRouteQuote(step);
    },

    async executeRoute(routeId: string) {
      const route = routeCache.get(routeId);
      if (!route) {
        throw new Error(`route not in cache: ${routeId}`);
      }
      if (!options.getWalletClient) {
        throw new Error("wallet client required for live LI.FI execute");
      }

      const executed = await lifiExecuteRoute(route);
      const txHash = extractTxHash(executed);
      return {
        txHash,
        status: "DONE" as const,
      };
    },
  };
}

function extractTxHash(route: Route): `0x${string}` {
  for (const step of route.steps) {
    const processes = (step as { execution?: { process?: Array<{ txHash?: string }> } })
      .execution?.process;
    if (processes) {
      for (const p of processes) {
        if (p.txHash?.startsWith("0x")) {
          return p.txHash as `0x${string}`;
        }
      }
    }
  }
  return `0x${"00".repeat(32)}` as `0x${string}`;
}

/** Reset SDK config between tests. */
export function resetLifiSdkForTests(): void {
  configured = false;
  routeCache.clear();
}
