import { describe, it, expect, vi } from "vitest";
import { createJuicywayProvider } from "../juicyway.js";
import { resolveOfframpProvider } from "../factory.js";
import { randomUUID } from "node:crypto";

describe("juicyway provider", () => {
  it("locks FX, converts, and pays out NGN", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "rate-1" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "swap-1", status: "success" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "payout-abc" } }),
      });

    const provider = createJuicywayProvider({
      apiKey: "test-key",
      baseUrl: "https://api-sandbox.spendjuice.com",
      beneficiaryId: "ben-1",
      fetchFn,
    });

    const result = await provider.convert({
      stablecoinAmount: "1000000",
      stablecoinSymbol: "USDC",
      chainId: 11155111,
      targetNgn: 150_000,
      idempotencyKey: randomUUID(),
    });

    expect(result.reference).toBe("payout-abc");
    expect(result.ngnAmount).toBe(150_000);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

describe("resolveOfframpProvider", () => {
  it("defaults to juicyway mock without keys", () => {
    const p = resolveOfframpProvider({ env: { OFFRAMP_PROVIDER: "juicyway" } });
    expect(p.name).toBe("juicyway-mock");
  });

  it("selects juicyway when keys present", () => {
    const p = resolveOfframpProvider({
      env: {
        OFFRAMP_PROVIDER: "juicyway",
        JUICYWAY_API_KEY: "key",
        JUICYWAY_BENEFICIARY_ID: "ben",
      },
    });
    expect(p.name).toBe("juicyway");
  });

  it("rejects yellowcard when selected", () => {
    expect(() =>
      resolveOfframpProvider({
        env: {
          OFFRAMP_PROVIDER: "yellowcard",
          YELLOWCARD_API_KEY: "yc-key",
        },
      }),
    ).toThrow(/Yellow Card provider unavailable/);
  });
});
