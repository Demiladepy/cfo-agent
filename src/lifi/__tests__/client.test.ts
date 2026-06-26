import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLifiClient, type LifiSdk } from "../client.js";
import { createPolicyEngineWithAudit } from "../../policy/index.js";
import { closeDatabase, migrate, openDatabase } from "../../db/index.js";
import { createMemoryStore } from "../../memory/index.js";
import { loadPolicyFromObject } from "../../policy/config.js";
import { isOk } from "../../lib/result.js";
import type { RouteQuote } from "../types.js";
import {
  activateKillSwitch,
  deactivateKillSwitch,
} from "../../policy/kill-switch.js";

const policyConfig = {
  per_tx_cap_ngn: 500_000,
  daily_cap_ngn: 2_000_000,
  weekly_cap_ngn: 5_000_000,
  confirm_threshold_ngn: 100_000,
  velocity: { max_actions: 100, window_seconds: 3600 },
  allowlist: {
    crypto_addresses: ["0x0000000000000000000000000000000000000001"],
    index_recipient_categories: ["family"],
  },
};

const mockRoute: RouteQuote = {
  id: "route-test-1",
  fromAmount: "1000000",
  toAmount: "990000",
  toAmountMin: "980000",
  gasCostUsd: 0.5,
  feeCostUsd: 0.2,
  slippageBps: 30,
  hops: 1,
  steps: [{ tool: "swap", fromChainId: 11155111, toChainId: 11155111, feeUsd: 0.2 }],
  createdAt: Date.now(),
  toAddress: "0x0000000000000000000000000000000000000001",
};

function createMockSdk(route: RouteQuote = mockRoute): LifiSdk {
  return {
    getQuote: async () => route,
    executeRoute: async () => ({
      txHash: `0x${"ef".repeat(32)}` as `0x${string}`,
      status: "DONE",
    }),
  };
}

describe("lifi client", () => {
  let db: ReturnType<typeof openDatabase>;
  let dbDir: string;
  let killSwitchPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "cfo-lifi-"));
    killSwitchPath = join(dbDir, "agent.kill");
    process.env["KILL_SWITCH_PATH"] = killSwitchPath;
    db = openDatabase(join(dbDir, "test.db"));
    migrate(db);
    deactivateKillSwitch(killSwitchPath);
  });

  afterEach(() => {
    closeDatabase(db);
    deactivateKillSwitch(killSwitchPath);
    delete process.env["KILL_SWITCH_PATH"];
    rmSync(dbDir, { recursive: true, force: true });
  });

  function makeClient(sdk: LifiSdk, dryRun = true) {
    const store = createMemoryStore(db);
    const policyLoaded = loadPolicyFromObject(policyConfig);
    if (!policyLoaded.ok) throw new Error("bad policy");
    const policy = createPolicyEngineWithAudit({
      config: policyLoaded.value,
      store,
      isKillSwitchActive: () => false,
    });
    return createLifiClient({
      sdk,
      policy,
      env: { LIVE_EXECUTION: false, LIFI_CONFIG_PATH: "config/lifi.example.yaml" },
      dryRun,
    });
  }

  it("quotes via sdk", async () => {
    const client = makeClient(createMockSdk());
    const result = await client.quote({
      fromChainId: 11155111,
      toChainId: 11155111,
      fromToken: "0xa",
      toToken: "0xb",
      fromAmount: "1000000",
    });
    expect(isOk(result)).toBe(true);
  });

  it("executes in dry-run with simulated hash", async () => {
    const client = makeClient(createMockSdk());
    const result = await client.execute(mockRoute, 50, 75_000);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.simulated).toBe(true);
    }
  });

  it("denies when policy rejects address", async () => {
    const client = makeClient(createMockSdk());
    const badRoute = {
      ...mockRoute,
      toAddress: "0x000000000000000000000000000000000000dead",
    };
    const result = await client.execute(badRoute, 50, 10_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("POLICY_DENIED");
  });

  it("denies when sanity check fails on slippage", async () => {
    const client = makeClient(createMockSdk());
    const sloppy = { ...mockRoute, slippageBps: 500 };
    const result = await client.execute(sloppy, 50, 10_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SANITY_FAILED");
  });

  it("denies when kill switch active", async () => {
    activateKillSwitch(killSwitchPath);
    try {
      const client = makeClient(createMockSdk());
      const result = await client.execute(mockRoute, 50, 10_000);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("KILL_SWITCH");
    } finally {
      deactivateKillSwitch(killSwitchPath);
    }
  });

  it("calls policy.evaluate on execute", async () => {
    const store = createMemoryStore(db);
    const policyLoaded = loadPolicyFromObject(policyConfig);
    if (!policyLoaded.ok) throw new Error("bad policy");
    const evaluateSpy = vi.fn();
    const policy = createPolicyEngineWithAudit({
      config: policyLoaded.value,
      store,
      isKillSwitchActive: () => false,
    });
    const original = policy.evaluate.bind(policy);
    policy.evaluate = (action: unknown) => {
      evaluateSpy(action);
      return original(action);
    };

    const client = createLifiClient({
      sdk: createMockSdk(),
      policy,
      env: { LIVE_EXECUTION: false, LIFI_CONFIG_PATH: "config/lifi.example.yaml" },
      dryRun: true,
    });

    await client.execute(mockRoute, 50, 10_000);
    expect(evaluateSpy).toHaveBeenCalledOnce();
  });
});
