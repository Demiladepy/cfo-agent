import type { Db } from "../db/index.js";
import { logger } from "../lib/index.js";

export { generateReflectionReport } from "./reflection.js";
export type { ReflectionReport } from "./reflection.js";

export const MEMORY_COMPONENT = "memory" as const;
export interface MemoryStore {
  db: Db;
}

export function createMemoryStore(db: Db): MemoryStore {
  logger.debug({ component: MEMORY_COMPONENT }, "memory store initialized");
  return { db };
}

export function insertEvent(
  store: MemoryStore,
  type: string,
  payload: unknown,
): number {
  const result = store.db
    .prepare("INSERT INTO events (type, payload) VALUES (?, ?)")
    .run(type, JSON.stringify(payload));
  return Number(result.lastInsertRowid);
}

export function upsertFact(
  store: MemoryStore,
  key: string,
  value: unknown,
): void {
  store.db
    .prepare(
      `INSERT INTO facts (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, JSON.stringify(value));
}

export function getFact(store: MemoryStore, key: string): unknown | null {
  const row = store.db
    .prepare("SELECT value FROM facts WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.value) as unknown;
}

export function appendAuditLog(
  store: MemoryStore,
  entry: {
    action: string;
    decision?: string;
    reason?: string;
    metadata?: unknown;
  },
): number {
  const result = store.db
    .prepare(
      "INSERT INTO audit_log (action, decision, reason, metadata) VALUES (?, ?, ?, ?)",
    )
    .run(
      entry.action,
      entry.decision ?? null,
      entry.reason ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    );
  return Number(result.lastInsertRowid);
}

export function tailAuditLog(
  store: MemoryStore,
  limit = 20,
): Array<{
  id: number;
  timestamp: string;
  action: string;
  decision: string | null;
  reason: string | null;
  metadata: string | null;
}> {
  return store.db
    .prepare(
      "SELECT id, timestamp, action, decision, reason, metadata FROM audit_log ORDER BY id DESC LIMIT ?",
    )
    .all(limit) as Array<{
    id: number;
    timestamp: string;
    action: string;
    decision: string | null;
    reason: string | null;
    metadata: string | null;
  }>;
}
