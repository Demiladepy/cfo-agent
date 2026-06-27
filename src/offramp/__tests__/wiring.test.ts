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
import { createMemoryStore, tailAuditLog } from "../../memory/index.js";
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
  category_caps: {
    offramp: { daily_ngn: 1_000_000 },
  },
};

describe("offramp wiring", () => {
  let db: ReturnType<typeof openDatabase>;
  let dbDir: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "cfo-offramp-wire-"));
    db = openDatabase(join(dbDir, "test.db"));
    migrate(db);
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("evaluates offramp policy kind and blocks duplicate idempotency keys", async () => {
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

    const key = randomUUID();
    const req = {
      stablecoinAmount: "1000000",
      stablecoinSymbol: "USDC",
      chainId: 11155111,
      targetNgn: 40_000,
      idempotencyKey: key,
    };

    const first = await client.convertToNgn(req);
    expect(isOk(first)).toBe(true);

    const audits = tailAuditLog(store, 5);
    expect(audits.some((a) => a.action === "offramp")).toBe(true);

    const dup = await client.convertToNgn(req);
    expect(isOk(dup)).toBe(false);
    if (!isOk(dup)) {
      expect(dup.error.code).toBe("DUPLICATE");
    }
  });
});
