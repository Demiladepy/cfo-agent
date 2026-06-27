import { describe, it, expect } from "vitest";
import { createIndexClient, createMockIndexMcp } from "../client.js";
import { createPolicyEngineWithAudit } from "../../policy/index.js";
import { loadPolicyFromObject } from "../../policy/config.js";
import { isOk } from "../../lib/result.js";

const policyConfig = {
  per_tx_cap_ngn: 500_000,
  daily_cap_ngn: 2_000_000,
  weekly_cap_ngn: 5_000_000,
  confirm_threshold_ngn: 200_000,
  velocity: { max_actions: 100, window_seconds: 3600 },
  allowlist: {
    crypto_addresses: ["0x1"],
    index_recipient_categories: ["family"],
  },
};

describe("index.getNgnBalance", () => {
  it("returns simulated balance from mock MCP when not live", async () => {
    const loaded = loadPolicyFromObject(policyConfig);
    if (!loaded.ok) throw new Error("bad policy");
    const policy = createPolicyEngineWithAudit({
      config: loaded.value,
      isKillSwitchActive: () => false,
    });
    const index = createIndexClient({
      mcp: createMockIndexMcp({ defaultBalanceNgn: 12_500 }),
      policy,
      store: { db: {} } as never,
      env: { LIVE_EXECUTION: false },
      dryRun: true,
      liveMcp: false,
    });

    const result = await index.getNgnBalance();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.balanceNgn).toBe(12_500);
      expect(result.value.simulated).toBe(true);
    }
  });

  it("reads balance from custom mock MCP handler when live", async () => {
    const loaded = loadPolicyFromObject(policyConfig);
    if (!loaded.ok) throw new Error("bad policy");
    const policy = createPolicyEngineWithAudit({
      config: loaded.value,
      isKillSwitchActive: () => false,
    });
    const index = createIndexClient({
      mcp: {
        ...createMockIndexMcp(),
        async getNgnBalance() {
          return { success: true, data: { balanceNgn: 88_000 } };
        },
      },
      policy,
      store: { db: {} } as never,
      env: { LIVE_EXECUTION: false },
      dryRun: true,
      liveMcp: true,
    });

    const result = await index.getNgnBalance();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.balanceNgn).toBe(88_000);
      expect(result.value.simulated).toBe(false);
    }
  });
});
