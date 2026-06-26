import { loadEnv } from "../config/env.js";
import { closeDatabase, migrate, openDatabase } from "../db/index.js";
import { logger } from "../lib/index.js";
import { createMemoryStore, MEMORY_COMPONENT } from "../memory/index.js";
import { agentPlaceholder } from "../agent/index.js";
import { indexPlaceholder } from "../index/index.js";
import { lifiPlaceholder } from "../lifi/index.js";
import { offrampPlaceholder } from "../offramp/index.js";
import { policyPlaceholder } from "../policy/index.js";
import { triggersPlaceholder } from "../triggers/index.js";
import { walletPlaceholder } from "../wallet/component.js";

export interface BootResult {
  dryRun: boolean;
  migrationsApplied: number[];
  components: string[];
  close: () => void;
}

export function parseArgs(argv: string[]): { dryRun: boolean; live: boolean } {
  const live = argv.includes("--live");
  const dryRun = !live;
  return { dryRun, live };
}

export function boot(argv: string[] = process.argv.slice(2)): BootResult {
  const env = loadEnv();
  const { dryRun, live } = parseArgs(argv);

  logger.info(
    {
      nodeEnv: env.NODE_ENV,
      dryRun,
      live,
      databasePath: env.DATABASE_PATH,
    },
    "personal-cfo-agent starting",
  );

  const db = openDatabase(env.DATABASE_PATH);
  const migrationsApplied = migrate(db);
  const store = createMemoryStore(db);

  if (migrationsApplied.length > 0) {
    logger.info({ migrationsApplied }, "database migrations applied");
  } else {
    logger.debug("database schema up to date");
  }

  const components = [
    policyPlaceholder(),
    walletPlaceholder(),
    lifiPlaceholder(),
    indexPlaceholder(),
    offrampPlaceholder(),
    MEMORY_COMPONENT,
    agentPlaceholder(),
    triggersPlaceholder(),
  ];

  logger.info(
    {
      components,
      dryRun,
      eventCount: (
        db.prepare("SELECT COUNT(*) as c FROM events").get() as { c: number }
      ).c,
    },
    "agent ready",
  );

  void store;

  process.on("SIGINT", () => {
    logger.info("shutting down");
    closeDatabase(db);
    process.exit(0);
  });

  return {
    dryRun,
    migrationsApplied,
    components,
    close: () => closeDatabase(db),
  };
}
