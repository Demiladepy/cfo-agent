import "dotenv/config";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "../config/env.js";
import { logger } from "../lib/index.js";
import { createDemoContext } from "./tools.js";
import { createDemoServer, resolveWebRoot } from "./server.js";

export function main(): void {
  const env = loadEnv();
  const port = Number(process.env["DEMO_PORT"] ?? "4173");
  const dataDir = join(process.cwd(), "data", "demo");
  const killSwitchPath = join(dataDir, "agent.kill");
  mkdirSync(dataDir, { recursive: true });
  process.env["KILL_SWITCH_PATH"] = killSwitchPath;

  const context = createDemoContext({
    dataDir,
    killSwitchPath,
    env,
    dryRun: !env.LIVE_EXECUTION,
  });
  const webRoot = resolveWebRoot();
  const server = createDemoServer({ port, context, webRoot });

  server.listen(port, () => {
    logger.info(
      { port, dryRun: context.dryRun, triggers: Boolean(context.triggers), webRoot },
      "demo server ready — open in browser to record",
    );
    console.log(`\n  Personal CFO demo → http://localhost:${port}\n`);
  });

  const shutdown = () => {
    server.close();
    context.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const isMain =
  process.argv[1]?.replace(/\\/g, "/").endsWith("demo/index.ts") ?? false;
if (isMain) {
  main();
}
