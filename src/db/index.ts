import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrations } from "./migrations.js";

export type Db = Database.Database;

export function openDatabase(path: string): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function getAppliedVersions(db: Db): Set<number> {
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
    )
    .get();

  if (!tableExists) return new Set();

  const rows = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all() as Array<{ version: number }>;

  return new Set(rows.map((r) => r.version));
}

export function migrate(db: Db): number[] {
  const applied = getAppliedVersions(db);
  const newlyApplied: number[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    const run = db.transaction(() => {
      migration.up(db);
      db.prepare(
        "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
      ).run(migration.version, migration.name);
    });

    run();
    newlyApplied.push(migration.version);
  }

  return newlyApplied;
}

export function closeDatabase(db: Db): void {
  db.close();
}
