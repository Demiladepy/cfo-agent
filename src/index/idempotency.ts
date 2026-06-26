import type { MemoryStore } from "../memory/index.js";
import { getFact, upsertFact } from "../memory/index.js";

const IDEMPOTENCY_PREFIX = "idempotency:";

export function hasIdempotencyKey(
  store: MemoryStore,
  key: string,
): boolean {
  return getFact(store, `${IDEMPOTENCY_PREFIX}${key}`) !== null;
}

export function recordIdempotencyKey(
  store: MemoryStore,
  key: string,
  reference: string,
): void {
  upsertFact(store, `${IDEMPOTENCY_PREFIX}${key}`, {
    reference,
    recordedAt: new Date().toISOString(),
  });
}

export function getIdempotencyReference(
  store: MemoryStore,
  key: string,
): string | null {
  const fact = getFact(store, `${IDEMPOTENCY_PREFIX}${key}`) as
    | { reference: string }
    | null;
  return fact?.reference ?? null;
}
