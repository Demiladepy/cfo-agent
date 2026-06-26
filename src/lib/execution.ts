import type { Env } from "../config/env.js";

/**
 * Live execution requires BOTH env var and CLI flag (safety constraint #4).
 */
export function isLiveExecutionAllowed(
  dryRun: boolean,
  env: Pick<Env, "LIVE_EXECUTION">,
): boolean {
  return !dryRun && env.LIVE_EXECUTION === true;
}
