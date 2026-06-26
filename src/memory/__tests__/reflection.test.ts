import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { closeDatabase, migrate, openDatabase } from "../../db/index.js";
import { createMemoryStore, insertEvent } from "../index.js";
import { generateReflectionReport } from "../reflection.js";

describe("reflection", () => {
  let db: ReturnType<typeof openDatabase>;
  let dbDir: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "cfo-reflect-"));
    db = openDatabase(join(dbDir, "test.db"));
    migrate(db);
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("generates weekly report for synthetic activity", () => {
    const store = createMemoryStore(db);
    const now = new Date();

    for (let i = 0; i < 4; i++) {
      insertEvent(store, "agent.transfer", {
        amountNgn: 5000,
        recipientCategory: "family",
        recipientId: "mom",
      });
    }
    insertEvent(store, "offramp.convert", { targetNgn: 50_000 });

    const report = generateReflectionReport(store, "weekly", now);
    expect(report.summary.spendEvents).toBeGreaterThanOrEqual(4);
    expect(report.summary.totalNgnSpent).toBe(20_000);
    expect(report.proceduralSuggestions.length).toBeGreaterThan(0);
    expect(report.markdown).toContain("Weekly reflection");
  });
});
