import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cli boot", () => {
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "cfo-boot-"));
    dbPath = join(dbDir, "agent.db");
    process.env["DATABASE_PATH"] = dbPath;
    process.env["NODE_ENV"] = "test";
    process.env["LOG_LEVEL"] = "silent";
  });

  afterEach(() => {
    delete process.env["DATABASE_PATH"];
    rmSync(dbDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("boots and migrates from empty database", async () => {
    const { boot } = await import("../../app/boot.js");
    const result = boot([]);
    expect(result.dryRun).toBe(true);
    expect(result.migrationsApplied).toEqual([1]);
    expect(result.components).toHaveLength(8);
    expect(existsSync(dbPath)).toBe(true);
    result.close();
  }, 30_000);
});
