import type { MemoryStore } from "../memory/index.js";
import type { PolicyUsageContext } from "./types.js";

type AuditRow = {
  metadata: string | null;
  decision: string | null;
};

function parseMetadata(metadata: string | null): {
  notionalNgn?: number;
  category?: string;
} {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as {
      action?: { notionalNgn?: number; category?: string };
    };
    return {
      notionalNgn: parsed.action?.notionalNgn,
      category: parsed.action?.category,
    };
  } catch {
    return {};
  }
}

export function createUsageContextFromStore(
  store: MemoryStore,
): PolicyUsageContext {
  const countStmt = store.db.prepare(
    `SELECT COUNT(*) as c FROM audit_log
     WHERE decision IN ('allow', 'confirm')
     AND timestamp >= datetime('now', ?)`,
  );

  const sumDailyStmt = store.db.prepare(
    `SELECT metadata FROM audit_log
     WHERE decision = 'allow'
     AND timestamp >= datetime('now', '-1 day')`,
  );

  const sumWeeklyStmt = store.db.prepare(
    `SELECT metadata FROM audit_log
     WHERE decision = 'allow'
     AND timestamp >= datetime('now', '-7 days')`,
  );

  return {
    countRecentActions(windowSeconds: number) {
      const modifier = `-${windowSeconds} seconds`;
      const row = countStmt.get(modifier) as { c: number };
      return row.c;
    },

    sumDailyNgn(category?: string) {
      const rows = sumDailyStmt.all() as AuditRow[];
      return sumRowsNgn(rows, category);
    },

    sumWeeklyNgn(category?: string) {
      const rows = sumWeeklyStmt.all() as AuditRow[];
      return sumRowsNgn(rows, category);
    },
  };
}

function sumRowsNgn(rows: AuditRow[], category?: string): number {
  let total = 0;
  for (const row of rows) {
    const meta = parseMetadata(row.metadata);
    if (category !== undefined && meta.category !== category) {
      continue;
    }
    if (typeof meta.notionalNgn === "number") {
      total += meta.notionalNgn;
    }
  }
  return total;
}
