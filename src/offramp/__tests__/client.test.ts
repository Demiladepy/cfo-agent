import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  createOfframpClient,
  createMockOfframpProvider,
} from "../client.js";
import { createPolicyEngineWithAudit } from "../../policy/index.js";
import { loadPolicyFromObject } from "../../policy/config.js";
import { closeDatabase, migrate, openDatabase } from "../../db/index.js";
import { createMemoryStore } from "../../memory/index.js";
import { isOk } from "../../lib/result.js";

const policyConfig = {
  per_tx_cap_ngn: 500_000,
  daily_cap_ngn: 2_000_000,
  weekly_cap_ngn: 5_000_000,
  confirm_threshold_ngn: 200_000,
  velocity: { max_actions: 100, window_seconds: 3600 },
  allowlist: {
    crypto_addresses: ["0x0000000000000000000000000000000000000001"],
    index_recipient_categories: ["family"],
  },
};

describe("offramp client", () => {
  let db: ReturnType<typeof openDatabase>;
  let dbDir: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "cfo-offramp-"));
    db = openDatabase(join(dbDir, "test.db"));
    migrate(db);
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("converts stablecoin to NGN in dry-run with audit event", async () => {
    const store = createMemoryStore(db);
    const policyLoaded = loadPolicyFromObject(policyConfig);
    if (!policyLoaded.ok) throw new Error("bad policy");
    const policy = createPolicyEngineWithAudit({
      config: policyLoaded.value,
      store,
      isKillSwitchActive: () => false,
    });

    const client = createOfframpClient({
      provider: createMockOfframpProvider(),
      policy,
      memory: store,
      env: { LIVE_EXECUTION: false },
      dryRun: true,
    });

    const result = await client.execute({
      stablecoinAmount: "1000000",
      stablecoinSymbol: "USDC",
      chainId: 11155111,
      targetNgn: 150_000,
      idempotencyKey: randomUUID(),
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.simulated).toBe(true);
      expect(result.value.ngnAmount).toBe(150_000);
    }

    const events = store.db
      .prepare("SELECT type FROM events WHERE type = 'offramp.convert'")
      .all();
    expect(events.length).toBe(1);
  });
});
