import "dotenv/config";
import { loadEnv } from "../config/env.js";
import { closeDatabase, openDatabase } from "../db/index.js";
import { createMemoryStore, tailAuditLog } from "../memory/index.js";

function parseLimit(argv: string[]): number {
  const tailIdx = argv.indexOf("tail");
  if (tailIdx >= 0 && argv[tailIdx + 1] !== undefined) {
    return Number(argv[tailIdx + 1]);
  }
  return 20;
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const limit = parseLimit(argv);
  const env = loadEnv();
  const db = openDatabase(env.DATABASE_PATH);
  const store = createMemoryStore(db);

  const entries = tailAuditLog(store, limit);

  if (entries.length === 0) {
    console.log("No audit log entries.");
  } else {
    for (const entry of entries.reverse()) {
      console.log(
        JSON.stringify({
          id: entry.id,
          timestamp: entry.timestamp,
          action: entry.action,
          decision: entry.decision,
          reason: entry.reason,
          metadata: entry.metadata ? JSON.parse(entry.metadata) : null,
        }),
      );
    }
  }

  closeDatabase(db);
  return 0;
}

const isMain =
  process.argv[1]?.replace(/\\/g, "/").endsWith("cli/audit.ts") ?? false;
if (isMain) {
  const code = main();
  process.exit(code);
}
