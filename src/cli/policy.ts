import "dotenv/config";
import type { Env } from "../config/env.js";
import { loadEnv } from "../config/env.js";
import { isOk } from "../lib/result.js";
import {
  loadPolicyFile,
  resolvePolicyPath,
} from "../policy/config.js";
import type { PolicyConfig } from "../policy/types.js";

export function showPolicy(
  env: Env = loadEnv(),
):
  | { ok: true; policy: PolicyConfig; path: string }
  | { ok: false; error: string } {
  const pathResult = resolvePolicyPath(env.POLICY_PATH);

  if (!isOk(pathResult)) {
    return { ok: false, error: pathResult.error.message };
  }

  const loaded = loadPolicyFile(pathResult.value);
  if (!isOk(loaded)) {
    return { ok: false, error: loaded.error.message };
  }

  return { ok: true, policy: loaded.value, path: pathResult.value };
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const subcommand = argv[0] ?? "show";

  if (subcommand !== "show") {
    console.error(`Unknown policy command: ${subcommand}`);
    console.error("Usage: pnpm policy show");
    return 1;
  }

  const result = showPolicy();
  if (!result.ok) {
    console.error(result.error);
    return 1;
  }

  console.log(JSON.stringify(result.policy, null, 2));
  console.error(`(source: ${result.path})`);
  return 0;
}

const isMain =
  process.argv[1]?.replace(/\\/g, "/").endsWith("cli/policy.ts") ?? false;
if (isMain) {
  process.exit(main());
}
