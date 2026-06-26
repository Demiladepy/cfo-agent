import "dotenv/config";
import { loadEnv } from "../config/env.js";
import { isOk } from "../lib/result.js";
import {
  loadPolicyFile,
  resolvePolicyPath,
} from "../policy/config.js";

export function main(argv: string[] = process.argv.slice(2)): number {
  const subcommand = argv[0] ?? "show";

  if (subcommand !== "show") {
    console.error(`Unknown policy command: ${subcommand}`);
    console.error("Usage: pnpm policy show");
    return 1;
  }

  const env = loadEnv();
  const pathResult = resolvePolicyPath(env.POLICY_PATH);

  if (!isOk(pathResult)) {
    console.error(pathResult.error.message);
    return 1;
  }

  const loaded = loadPolicyFile(pathResult.value);
  if (!isOk(loaded)) {
    console.error(loaded.error.message);
    return 1;
  }

  console.log(JSON.stringify(loaded.value, null, 2));
  console.error(`(source: ${pathResult.value})`);
  return 0;
}

const isMain =
  process.argv[1]?.replace(/\\/g, "/").endsWith("cli/policy.ts") ?? false;
if (isMain) {
  process.exit(main());
}
