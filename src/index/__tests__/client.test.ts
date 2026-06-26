import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  createIndexClient,
  createMockIndexMcp,
} from "../client.js";
import { createPolicyEngineWithAudit } from "../../policy/index.js";
import { loadPolicyFromObject } from "../../policy/config.js";
import { closeDatabase, migrate, openDatabase } from "../../db/index.js";
import { createMemoryStore } from "../../memory/index.js";
import { isOk } from "../../lib/result.js";
import { deactivateKillSwitch } from "../../policy/kill-switch.js";

const policyConfig = {
  per_tx_cap_ngn: 100_000,
  daily_cap_ngn: 500_000,
  weekly_cap_ngn: 2_000_000,
  confirm_threshold_ngn: 50_000,
  velocity: { max_actions: 100, window_seconds: 3600 },
  allowlist: {
    crypto_addresses: [],
    index_recipient_categories: ["family", "airtime", "food"],
  },
  category_caps: { airtime: { daily_ngn: 20_000 } },
};

describe("index client", () => {
  let db: ReturnType<typeof openDatabase>;
  let dbDir: string;
  let killSwitchPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "cfo-index-"));
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

  function makeClient(opts?: { onConfirm?: () => Promise<boolean> }) {
    const store = createMemoryStore(db);
    const policyLoaded = loadPolicyFromObject(policyConfig);
    if (!policyLoaded.ok) throw new Error("bad policy");
    const policy = createPolicyEngineWithAudit({
      config: policyLoaded.value,
      store,
      isKillSwitchActive: () => false,
    });
    return createIndexClient({
      mcp: createMockIndexMcp(),
      policy,
      store,
      env: { LIVE_EXECUTION: false },
      dryRun: true,
      onConfirmRequired: opts?.onConfirm,
    });
  }

  it("purchases airtime in test mode", async () => {
    const client = makeClient();
    const result = await client.purchaseAirtime({
      phone: "08012345678",
      amountNgn: 1000,
      network: "mtn",
      idempotencyKey: randomUUID(),
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.simulated).toBe(true);
      expect(result.value.reference).toContain("dry-run");
    }
  });

  it("transfer dry-run is inspectable", async () => {
    const client = makeClient();
    const key = randomUUID();
    const result = await client.transfer({
      recipientId: "mom",
      recipientCategory: "family",
      amountNgn: 5000,
      idempotencyKey: key,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.reference).toBe(`dry-run-${key.slice(0, 8)}`);
    }
  });

  it("blocks double-submit via idempotency", async () => {
    const client = makeClient();
    const key = randomUUID();
    const req = {
      phone: "08012345678",
      amountNgn: 1000,
      network: "mtn" as const,
      idempotencyKey: key,
    };
    await client.purchaseAirtime(req);
    const second = await client.purchaseAirtime(req);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("DUPLICATE");
  });

  it("requires confirm for large transfers without approval", async () => {
    const client = makeClient();
    const result = await client.transfer({
      recipientId: "mom",
      recipientCategory: "family",
      amountNgn: 60_000,
      idempotencyKey: randomUUID(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFIRM_REQUIRED");
  });
});
