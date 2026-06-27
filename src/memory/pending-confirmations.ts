import { randomUUID } from "node:crypto";
import type { MemoryStore } from "./index.js";

export type PendingConfirmationStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired";

export type PendingConfirmationRow = {
  id: string;
  action_json: string;
  policy_snapshot_json: string;
  created_at: string;
  expires_at: string;
  status: PendingConfirmationStatus;
};

const DEFAULT_TTL_SECONDS = 300;

export function insertPendingConfirmation(
  store: MemoryStore,
  input: {
    action: unknown;
    policySnapshot: unknown;
    ttlSeconds?: number;
  },
): string {
  const id = randomUUID();
  const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  store.db
    .prepare(
      `INSERT INTO pending_confirmations
       (id, action_json, policy_snapshot_json, expires_at, status)
       VALUES (?, ?, ?, datetime('now', ?), 'pending')`,
    )
    .run(
      id,
      JSON.stringify(input.action),
      JSON.stringify(input.policySnapshot),
      `+${ttl} seconds`,
    );
  return id;
}

export function getPendingConfirmation(
  store: MemoryStore,
  id: string,
): PendingConfirmationRow | null {
  const row = store.db
    .prepare(
      `SELECT id, action_json, policy_snapshot_json, created_at, expires_at, status
       FROM pending_confirmations WHERE id = ?`,
    )
    .get(id) as PendingConfirmationRow | undefined;
  return row ?? null;
}

export function listActivePendingConfirmations(
  store: MemoryStore,
): PendingConfirmationRow[] {
  expireStalePendingConfirmations(store);
  return store.db
    .prepare(
      `SELECT id, action_json, policy_snapshot_json, created_at, expires_at, status
       FROM pending_confirmations
       WHERE status = 'pending' AND expires_at > datetime('now')
       ORDER BY created_at ASC`,
    )
    .all() as PendingConfirmationRow[];
}

export function updatePendingConfirmationStatus(
  store: MemoryStore,
  id: string,
  status: PendingConfirmationStatus,
): void {
  store.db
    .prepare("UPDATE pending_confirmations SET status = ? WHERE id = ?")
    .run(status, id);
}

export function mergePendingConfirmationAction(
  store: MemoryStore,
  id: string,
  patch: Record<string, unknown>,
): void {
  const row = getPendingConfirmation(store, id);
  if (!row) return;
  const action = JSON.parse(row.action_json) as Record<string, unknown>;
  store.db
    .prepare("UPDATE pending_confirmations SET action_json = ? WHERE id = ?")
    .run(JSON.stringify({ ...action, ...patch }), id);
}

export function isPendingConfirmationExpired(
  store: MemoryStore,
  id: string,
): boolean {
  const row = store.db
    .prepare(
      `SELECT id FROM pending_confirmations
       WHERE id = ? AND status = 'pending' AND expires_at <= datetime('now')`,
    )
    .get(id) as { id: string } | undefined;
  return row !== undefined;
}

export function expireStalePendingConfirmations(store: MemoryStore): number {
  const stale = store.db
    .prepare(
      `SELECT id FROM pending_confirmations
       WHERE status = 'pending' AND expires_at <= datetime('now')`,
    )
    .all() as Array<{ id: string }>;

  if (stale.length === 0) return 0;

  store.db
    .prepare(
      `UPDATE pending_confirmations SET status = 'expired'
       WHERE status = 'pending' AND expires_at <= datetime('now')`,
    )
    .run();

  return stale.length;
}
