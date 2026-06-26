import type { MemoryStore } from "./index.js";

export type ReflectionReport = {
  period: "daily" | "weekly";
  startDate: string;
  endDate: string;
  summary: {
    totalEvents: number;
    spendEvents: number;
    totalNgnSpent: number;
    bridgeFeesUsd: number;
    policyDenials: number;
  };
  proceduralSuggestions: string[];
  markdown: string;
};

export function generateReflectionReport(
  store: MemoryStore,
  period: "daily" | "weekly",
  referenceDate = new Date(),
): ReflectionReport {
  const days = period === "daily" ? 1 : 7;
  const end = referenceDate.toISOString();
  const start = new Date(referenceDate.getTime() - days * 86_400_000).toISOString();

  const events = store.db
    .prepare(
      `SELECT type, payload FROM events
       WHERE created_at >= datetime(?) AND created_at <= datetime(?)`,
    )
    .all(start, end) as Array<{ type: string; payload: string }>;

  const auditDenials = store.db
    .prepare(
      `SELECT COUNT(*) as c FROM audit_log
       WHERE decision = 'deny' AND timestamp >= datetime(?) AND timestamp <= datetime(?)`,
    )
    .get(start, end) as { c: number };

  let totalNgnSpent = 0;
  let bridgeFeesUsd = 0;
  let spendEvents = 0;

  for (const event of events) {
    const payload = JSON.parse(event.payload) as Record<string, unknown>;
    if (event.type.includes("transfer") || event.type.includes("spend")) {
      spendEvents++;
      if (typeof payload["amountNgn"] === "number") {
        totalNgnSpent += payload["amountNgn"];
      }
    }
    if (event.type === "offramp.convert" && typeof payload["targetNgn"] === "number") {
      bridgeFeesUsd += 0.5;
    }
  }

  const proceduralSuggestions = detectProceduralPatterns(events);

  const markdown = [
    `# ${period === "daily" ? "Daily" : "Weekly"} reflection`,
    ``,
    `Period: ${start.slice(0, 10)} → ${end.slice(0, 10)}`,
    ``,
    `## Spend summary`,
    `- Events: ${events.length}`,
    `- Spend actions: ${spendEvents}`,
    `- Total NGN: ₦${totalNgnSpent.toLocaleString()}`,
    `- Est. bridge fee bleed: $${bridgeFeesUsd.toFixed(2)}`,
    `- Policy denials: ${auditDenials.c}`,
    ``,
    `## Suggested routines (PENDING_APPROVAL — never auto-applied)`,
    ...proceduralSuggestions.map((s) => `- ${s}`),
  ].join("\n");

  return {
    period,
    startDate: start,
    endDate: end,
    summary: {
      totalEvents: events.length,
      spendEvents,
      totalNgnSpent,
      bridgeFeesUsd,
      policyDenials: auditDenials.c,
    },
    proceduralSuggestions,
    markdown,
  };
}

function detectProceduralPatterns(
  events: Array<{ type: string; payload: string }>,
): string[] {
  const categoryCounts = new Map<string, number>();
  for (const event of events) {
    if (!event.type.includes("transfer") && !event.type.includes("spend")) {
      continue;
    }
    const payload = JSON.parse(event.payload) as Record<string, unknown>;
    const cat =
      (payload["recipientCategory"] as string) ??
      (payload["category"] as string) ??
      "unknown";
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }

  const suggestions: string[] = [];
  for (const [cat, count] of categoryCounts) {
    if (count >= 3) {
      suggestions.push(
        `Recurring ${cat} spend detected (${count}x) — consider a standing rule with explicit cap`,
      );
    }
  }
  return suggestions;
}
