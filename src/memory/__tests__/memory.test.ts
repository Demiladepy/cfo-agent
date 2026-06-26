import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  closeDatabase,
  getAppliedVersions,
  migrate,
  openDatabase,
} from "../../db/index.js";
import {
  appendAuditLog,
  createMemoryStore,
  insertEvent,
  tailAuditLog,
  upsertFact,
  getFact,
} from "../../memory/index.js";

describe("database migrations", () => {
  let dbPath: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "cfo-db-"));
    dbPath = join(dir, "test.db");
    db = openDatabase(dbPath);
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(join(dbPath, ".."), { recursive: true, force: true });
  });

  it("migrates from empty database", () => {
    expect(getAppliedVersions(db).size).toBe(0);
    const applied = migrate(db);
    expect(applied).toEqual([1]);
    expect(getAppliedVersions(db).has(1)).toBe(true);
  });

  it("is idempotent on second run", () => {
    migrate(db);
    const second = migrate(db);
    expect(second).toEqual([]);
  });

  it("creates events, facts, and audit_log tables", () => {
    migrate(db);
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("events");
    expect(names).toContain("facts");
    expect(names).toContain("audit_log");
    expect(names).toContain("schema_migrations");
  });
});

describe("memory store", () => {
  let dbPath: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "cfo-mem-"));
    dbPath = join(dir, "test.db");
    db = openDatabase(dbPath);
    migrate(db);
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(join(dbPath, ".."), { recursive: true, force: true });
  });

  it("persists events and facts", () => {
    const store = createMemoryStore(db);
    const eventId = insertEvent(store, "test.event", { foo: "bar" });
    expect(eventId).toBeGreaterThan(0);

    upsertFact(store, "operator.name", "test");
    expect(getFact(store, "operator.name")).toBe("test");

    upsertFact(store, "operator.name", "updated");
    expect(getFact(store, "operator.name")).toBe("updated");
  });

  it("appends and tails audit log", () => {
    const store = createMemoryStore(db);
    appendAuditLog(store, {
      action: "swap",
      decision: "allow",
      reason: "within caps",
    });
    const entries = tailAuditLog(store, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("swap");
    expect(entries[0]?.decision).toBe("allow");
  });
});
