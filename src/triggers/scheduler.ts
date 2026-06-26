import cron from "node-cron";
import type { MemoryStore } from "../memory/index.js";
import { logger } from "../lib/logger.js";

export type RebalanceCheckDeps = {
  memory: MemoryStore;
  getNgnBalance: () => Promise<number>;
  targetNgnFloat: number;
  onRebalanceNeeded: (deficit: number) => Promise<void>;
};

export async function runRebalanceCheck(
  deps: RebalanceCheckDeps,
): Promise<{ triggered: boolean; deficit: number }> {
  const balance = await deps.getNgnBalance();
  const deficit = deps.targetNgnFloat - balance;

  if (deficit > 0) {
    logger.info({ balance, target: deps.targetNgnFloat, deficit }, "rebalance needed");
    await deps.onRebalanceNeeded(deficit);
    return { triggered: true, deficit };
  }

  logger.debug({ balance, target: deps.targetNgnFloat }, "float sufficient");
  return { triggered: false, deficit: 0 };
}

export type TriggerSchedulerDeps = {
  cronExpression: string;
  rebalance: RebalanceCheckDeps;
};

export function startTriggerScheduler(deps: TriggerSchedulerDeps): {
  stop: () => void;
} {
  const task = cron.schedule(deps.cronExpression, () => {
    void runRebalanceCheck(deps.rebalance);
  });

  return {
    stop: () => task.stop(),
  };
}
