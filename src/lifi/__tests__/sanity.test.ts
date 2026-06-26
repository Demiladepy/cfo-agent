import { describe, it, expect, vi } from "vitest";
import { checkRouteSanity } from "../sanity.js";
import type { LifiConfig, RouteQuote } from "../types.js";

const config: LifiConfig = {
  max_slippage_bps: 100,
  max_hops: 3,
  max_fee_percent: 2.5,
  route_max_age_seconds: 60,
  default_from_chain_id: 11155111,
  default_to_chain_id: 11155111,
  default_from_token: "0xusdc",
  default_to_token: "0xusdc",
};

function makeRoute(overrides: Partial<RouteQuote> = {}): RouteQuote {
  return {
    id: "route-1",
    fromAmount: "1000000",
    toAmount: "990000",
    toAmountMin: "980000",
    gasCostUsd: 1,
    feeCostUsd: 0.5,
    slippageBps: 50,
    hops: 1,
    steps: [{ tool: "swap", fromChainId: 1, toChainId: 1, feeUsd: 0.5 }],
    createdAt: Date.now(),
    toAddress: "0x0000000000000000000000000000000000000001",
    ...overrides,
  };
}

describe("sanity checks", () => {
  it("rejects stale routes", () => {
    const result = checkRouteSanity(
      makeRoute({ createdAt: Date.now() - 120_000 }),
      config,
      100,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("stale");
  });

  it("rejects excessive slippage", () => {
    const result = checkRouteSanity(
      makeRoute({ slippageBps: 200 }),
      config,
      100,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("slippage");
  });

  it("rejects too many hops", () => {
    const result = checkRouteSanity(makeRoute({ hops: 5 }), config, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("hops");
  });

  it("rejects high fee percent", () => {
    const result = checkRouteSanity(
      makeRoute({ feeCostUsd: 10, gasCostUsd: 10 }),
      config,
      100,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("fees");
  });

  it("passes valid route", () => {
    expect(checkRouteSanity(makeRoute(), config, 100).ok).toBe(true);
  });
});
