import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isOk, isErr } from "../../lib/result.js";
import {
  activateKillSwitch,
  createPolicyEngineWithAudit,
  deactivateKillSwitch,
  evaluateRules,
  isKillSwitchActive,
  loadPolicyFromObject,
  type PolicyConfig,
  type PolicyUsageContext,
} from "../index.js";
import { closeDatabase, migrate, openDatabase } from "../../db/index.js";
import { createMemoryStore, tailAuditLog } from "../../memory/index.js";

const baseConfig: PolicyConfig = {
  per_tx_cap_ngn: 100_000,
  daily_cap_ngn: 500_000,
  weekly_cap_ngn: 2_000_000,
  confirm_threshold_ngn: 50_000,
  velocity: { max_actions: 5, window_seconds: 3600 },
  allowlist: {
    crypto_addresses: ["0xabc"],
    index_recipient_categories: ["family", "food"],
  },
  category_caps: {
    food: { daily_ngn: 15_000 },
  },
};

const zeroUsage: PolicyUsageContext = {
  countRecentActions: () => 0,
  sumDailyNgn: () => 0,
  sumWeeklyNgn: () => 0,
};

describe("policy config schema", () => {
  it("accepts valid config", () => {
    const result = loadPolicyFromObject(baseConfig);
    expect(isOk(result)).toBe(true);
  });

  it("rejects invalid config", () => {
    const result = loadPolicyFromObject({ per_tx_cap_ngn: -1 });
    expect(isErr(result)).toBe(true);
  });
});

describe("kill switch", () => {
  let switchPath: string;

  beforeEach(() => {
    switchPath = join(tmpdir(), `agent.kill.test.${Date.now()}`);
  });

  afterEach(() => {
    deactivateKillSwitch(switchPath);
  });

  it("denies all actions when active", () => {
    activateKillSwitch(switchPath);
    expect(isKillSwitchActive(switchPath)).toBe(true);

    const result = evaluateRules(
      baseConfig,
      { kind: "spend", notionalNgn: 1000, category: "food" },
      zeroUsage,
      true,
    );
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("kill switch");
  });

  it("would allow small spend when inactive", () => {
    const result = evaluateRules(
      baseConfig,
      { kind: "spend", notionalNgn: 1000, category: "food" },
      zeroUsage,
      false,
    );
    expect(result.decision).toBe("allow");
  });
});

describe("per-tx cap", () => {
  it("denies when notional exceeds cap", () => {
    const result = evaluateRules(
      baseConfig,
      { kind: "transfer", notionalNgn: 150_000, recipientCategory: "family" },
      zeroUsage,
      false,
    );
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("per-tx cap");
  });
});

describe("daily cap", () => {
  it("denies when daily total would exceed cap", () => {
    const usage: PolicyUsageContext = {
      ...zeroUsage,
      sumDailyNgn: () => 450_000,
    };
    const result = evaluateRules(
      baseConfig,
      { kind: "spend", notionalNgn: 60_000, category: "food" },
      usage,
      false,
    );
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("daily cap");
  });
});

describe("weekly cap", () => {
  it("denies when weekly total would exceed cap", () => {
    const usage: PolicyUsageContext = {
      ...zeroUsage,
      sumWeeklyNgn: () => 1_950_000,
    };
    const result = evaluateRules(
      baseConfig,
      {
        kind: "transfer",
        notionalNgn: 60_000,
        recipientCategory: "family",
      },
      usage,
      false,
    );
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("weekly cap");
  });
});

describe("velocity", () => {
  it("denies when too many recent actions", () => {
    const usage: PolicyUsageContext = {
      ...zeroUsage,
      countRecentActions: () => 5,
    };
    const result = evaluateRules(
      baseConfig,
      { kind: "spend", notionalNgn: 1000, category: "food" },
      usage,
      false,
    );
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("velocity");
  });
});

describe("allowlist", () => {
  it("denies crypto address not on allowlist", () => {
    const result = evaluateRules(
      baseConfig,
      {
        kind: "swap",
        notionalNgn: 10_000,
        cryptoAddress: "0xdead",
      },
      zeroUsage,
      false,
    );
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("crypto address");
  });

  it("allows crypto address on allowlist", () => {
    const result = evaluateRules(
      baseConfig,
      {
        kind: "bridge",
        notionalNgn: 10_000,
        cryptoAddress: "0xAbC",
      },
      zeroUsage,
      false,
    );
    expect(result.decision).toBe("allow");
  });

  it("denies index recipient category not on allowlist", () => {
    const result = evaluateRules(
      baseConfig,
      {
        kind: "transfer",
        notionalNgn: 10_000,
        recipientCategory: "gambling",
      },
      zeroUsage,
      false,
    );
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("recipient category");
  });
});

describe("category caps", () => {
  it("denies when category daily cap would be exceeded", () => {
    const usage: PolicyUsageContext = {
      ...zeroUsage,
      sumDailyNgn: (cat) => (cat === "food" ? 14_000 : 0),
    };
    const result = evaluateRules(
      baseConfig,
      { kind: "spend", notionalNgn: 2_000, category: "food" },
      usage,
      false,
    );
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("category daily cap");
  });
});

describe("confirm threshold", () => {
  it("requires confirm for amounts at or above threshold", () => {
    const result = evaluateRules(
      baseConfig,
      {
        kind: "transfer",
        notionalNgn: 50_000,
        recipientCategory: "family",
      },
      zeroUsage,
      false,
    );
    expect(result.decision).toBe("confirm");
    expect(result.reason).toContain("confirm threshold");
  });

  it("allows amounts below threshold", () => {
    const result = evaluateRules(
      baseConfig,
      { kind: "spend", notionalNgn: 10_000, category: "food" },
      zeroUsage,
      false,
    );
    expect(result.decision).toBe("allow");
  });
});

describe("policy engine audit persistence", () => {
  let dbPath: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "cfo-policy-"));
    dbPath = join(dir, "test.db");
    db = openDatabase(dbPath);
    migrate(db);
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(join(dbPath, ".."), { recursive: true, force: true });
  });

  it("persists every evaluation to audit log", () => {
    const store = createMemoryStore(db);
    const engine = createPolicyEngineWithAudit({
      config: baseConfig,
      store,
      isKillSwitchActive: () => false,
    });

    const result = engine.evaluate({
      kind: "spend",
      notionalNgn: 5000,
      category: "food",
    });

    expect(isOk(result)).toBe(true);
    const entries = tailAuditLog(store, 1);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("spend");
    expect(entries[0]?.decision).toBe("allow");
  });

  it("returns error for invalid action without persisting", () => {
    const store = createMemoryStore(db);
    const engine = createPolicyEngineWithAudit({
      config: baseConfig,
      store,
    });

    const result = engine.evaluate({ kind: "invalid" });
    expect(isErr(result)).toBe(true);
    expect(tailAuditLog(store, 1)).toHaveLength(0);
  });
});

describe("kill switch safety test", () => {
  it("fails if kill switch check is removed from evaluateRules", () => {
    // This test documents the safety invariant: without kill switch check,
    // an active switch would not deny.
    const withoutKillCheck = (
      config: PolicyConfig,
      action: Parameters<typeof evaluateRules>[1],
      usage: PolicyUsageContext,
    ) => evaluateRules(config, action, usage, false);

    const switchPath = join(tmpdir(), `agent.kill.safety.${Date.now()}`);
    process.env["KILL_SWITCH_PATH"] = switchPath;
    activateKillSwitch(switchPath);
    try {
      const withCheck = evaluateRules(
        baseConfig,
        { kind: "spend", notionalNgn: 1000, category: "food" },
        zeroUsage,
        isKillSwitchActive(),
      );
      const withoutCheck = withoutKillCheck(
        baseConfig,
        { kind: "spend", notionalNgn: 1000, category: "food" },
        zeroUsage,
      );

      expect(withCheck.decision).toBe("deny");
      expect(withoutCheck.decision).not.toBe("deny");
    } finally {
      deactivateKillSwitch(switchPath);
      delete process.env["KILL_SWITCH_PATH"];
    }
  });
});
