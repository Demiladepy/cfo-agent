import { describe, it, expect, vi } from "vitest";
import { createFxService } from "../rate.js";

describe("fx.getUsdToNgn", () => {
  it("returns live rate from provider and caches for 60s", async () => {
    const getRate = vi.fn().mockResolvedValue(1625.5);
    const fx = createFxService({
      getRateFromProvider: getRate,
      fallbackUsdNgn: 1500,
      cacheTtlMs: 60_000,
    });

    const first = await fx.getUsdToNgn();
    const second = await fx.getUsdToNgn();

    expect(first).toEqual({ rate: 1625.5, source: "live" });
    expect(second).toEqual({ rate: 1625.5, source: "cache" });
    expect(getRate).toHaveBeenCalledTimes(1);
  });

  it("falls back when provider fetch fails", async () => {
    const fx = createFxService({
      getRateFromProvider: async () => {
        throw new Error("network down");
      },
      fallbackUsdNgn: 1480,
    });

    const result = await fx.getUsdToNgn();
    expect(result).toEqual({ rate: 1480, source: "fallback" });
  });

  it("uses fallback when no provider configured", async () => {
    const fx = createFxService({ fallbackUsdNgn: 1500 });
    const result = await fx.getUsdToNgn();
    expect(result).toEqual({ rate: 1500, source: "fallback" });
  });
});
