import type { Env } from "../config/env.js";
import type { LifiSdk } from "./client.js";
import { createLifiSdk, type CreateLifiSdkOptions } from "./sdk.js";
import type { RouteQuote } from "./types.js";

const FALLBACK_ROUTE: RouteQuote = {
  id: "mock-route",
  fromAmount: "1000000",
  toAmount: "990000",
  toAmountMin: "980000",
  gasCostUsd: 0.1,
  feeCostUsd: 0.1,
  slippageBps: 30,
  hops: 1,
  steps: [],
  createdAt: Date.now(),
  toAddress: "0x0000000000000000000000000000000000000001",
};

function createMockLifiSdk(): LifiSdk {
  return {
    getQuote: async () => ({ ...FALLBACK_ROUTE, id: `mock-${Date.now()}` }),
    executeRoute: async () => ({
      txHash: `0x${"cd".repeat(32)}` as `0x${string}`,
      status: "DONE",
    }),
  };
}

export function resolveLifiSdk(
  env: Pick<Env, "LIFI_INTEGRATOR">,
  options?: Partial<CreateLifiSdkOptions>,
): { sdk: LifiSdk; mode: "live" | "mock" } {
  const integrator = env.LIFI_INTEGRATOR ?? options?.integrator;
  if (!integrator) {
    return { sdk: createMockLifiSdk(), mode: "mock" };
  }
  return {
    sdk: createLifiSdk({
      integrator,
      fromAddress: options?.fromAddress,
      getWalletClient: options?.getWalletClient,
    }),
    mode: "live",
  };
}
