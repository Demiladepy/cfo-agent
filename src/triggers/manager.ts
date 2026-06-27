import cron from "node-cron";
import { join } from "node:path";
import type { Env } from "../config/env.js";
import type { AppContext } from "../app/create-tools.js";
import { generateReflectionReport } from "../memory/index.js";
import { insertEvent } from "../memory/index.js";
import { logger } from "../lib/logger.js";
import { executeRebalanceTopup } from "./rebalance-flow.js";
import {
  isTriggerJobPaused,
  pauseTriggerJob,
  resumeTriggerJob,
} from "./pause.js";
import {
  mergeTriggerJobStates,
  updateTriggerJobRun,
  type TriggerJobOutcome,
  type TriggerJobState,
} from "./state.js";
import { isOk } from "../lib/result.js";

export const REBALANCE_JOB_ID = "rebalance-check";
export const REFLECTION_JOB_ID = "reflection";

export const BOOT_DRY_RUN_LOG =
  "trigger {name} ran in dry-run on boot; live runs from next interval";

export type TriggerManager = {
  start: () => void;
  stop: () => void;
  status: () => TriggerJobState[];
  pause: (jobId: string) => void;
  resume: (jobId: string) => void;
  runNow: (jobId: string) => Promise<TriggerJobState | null>;
  isBootDryRunPending: (jobId: string) => boolean;
};

type JobDefinition = {
  id: string;
  label: string;
  schedule: string;
  cronOptions?: cron.ScheduleOptions;
  run: (effectiveDryRun: boolean) => Promise<{ outcome: TriggerJobOutcome; detail: string }>;
};

function estimateNextRun(schedule: string): string | null {
  const now = Date.now();
  if (schedule.startsWith("*/15")) {
    return new Date(now + 15 * 60 * 1000).toISOString();
  }
  if (schedule === "0 23 * * *") {
    const next = new Date();
    next.setHours(23, 0, 0, 0);
    if (next.getTime() <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }
  return null;
}

export function createTriggerManager(options: {
  context: AppContext;
  env: Env;
  dataDir: string;
}): TriggerManager {
  const { context, env, dataDir } = options;
  const bootDryRunPending = new Set<string>([REBALANCE_JOB_ID, REFLECTION_JOB_ID]);
  const cronTasks: cron.ScheduledTask[] = [];

  const rebalanceCron =
    env.TRIGGERS_REBALANCE_CRON ?? env.REBALANCE_CRON ?? "*/15 * * * *";
  const reflectionCron = "0 23 * * *";
  const targetNgn = env.REBALANCE_TARGET_NGN ?? 100_000;

  async function runRebalanceJob(effectiveDryRun: boolean) {
    const bal = await context.tools.index.getNgnBalance();
    const balanceNgn = isOk(bal) ? bal.value.balanceNgn : 0;
    const deficit = targetNgn - balanceNgn;

    if (deficit <= 0) {
      return {
        outcome: "float_sufficient" as TriggerJobOutcome,
        detail: `float ₦${balanceNgn.toLocaleString()} at or above ₦${targetNgn.toLocaleString()} target`,
      };
    }

    logger.info({ balance: balanceNgn, target: targetNgn, deficit }, "rebalance needed");

    const topup = await executeRebalanceTopup({
      tools: context.tools,
      store: context.store,
      policyConfig: context.tools.policyConfig,
      targetNgnFloat: targetNgn,
      dryRun: effectiveDryRun,
    });

    return {
      outcome: topup.outcome as TriggerJobOutcome,
      detail: topup.detail,
    };
  }

  async function runReflectionJob(_effectiveDryRun: boolean) {
    const report = generateReflectionReport(context.store, "daily");
    insertEvent(context.store, "trigger.reflection", {
      period: report.period,
      summary: report.summary,
      dryRun: true,
    });
    logger.info({ period: report.period }, "daily reflection generated");
    return {
      outcome: "executed" as TriggerJobOutcome,
      detail: `reflection report · ${report.summary.spendEvents} spend events`,
    };
  }

  const jobs: JobDefinition[] = [
    {
      id: REBALANCE_JOB_ID,
      label: "Rebalance check",
      schedule: rebalanceCron,
      run: runRebalanceJob,
    },
    {
      id: REFLECTION_JOB_ID,
      label: "Daily reflection",
      schedule: reflectionCron,
      cronOptions: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      run: runReflectionJob,
    },
  ];

  function jobDefinitions(): Array<{
    id: string;
    label: string;
    schedule: string;
    paused: boolean;
  }> {
    return jobs.map((j) => ({
      id: j.id,
      label: j.label,
      schedule: j.schedule,
      paused: isTriggerJobPaused(dataDir, j.id),
    }));
  }

  function resolveEffectiveDryRun(jobId: string): boolean {
    if (bootDryRunPending.has(jobId)) {
      bootDryRunPending.delete(jobId);
      logger.warn(
        BOOT_DRY_RUN_LOG.replace("{name}", jobId),
      );
      return true;
    }
    return context.dryRun;
  }

  async function executeJob(jobId: string): Promise<TriggerJobState | null> {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return null;

    if (isTriggerJobPaused(dataDir, jobId)) {
      const now = new Date().toISOString();
      updateTriggerJobRun(dataDir, jobId, {
        lastRun: now,
        nextRun: estimateNextRun(job.schedule),
        lastOutcome: "skipped_paused",
        lastDetail: "job paused via file flag",
      });
      return mergeTriggerJobStates(dataDir, jobDefinitions()).find((j) => j.id === jobId) ?? null;
    }

    const effectiveDryRun = resolveEffectiveDryRun(jobId);
    let outcome: TriggerJobOutcome = "error";
    let detail = "unknown";

    try {
      const result = await job.run(effectiveDryRun);
      outcome = result.outcome;
      detail = result.detail;
    } catch (e) {
      outcome = "error";
      detail = e instanceof Error ? e.message : String(e);
      logger.error({ jobId, err: detail }, "trigger job failed");
    }

    const now = new Date().toISOString();
    updateTriggerJobRun(dataDir, jobId, {
      lastRun: now,
      nextRun: estimateNextRun(job.schedule),
      lastOutcome: outcome,
      lastDetail: detail,
    });

    return mergeTriggerJobStates(dataDir, jobDefinitions()).find((j) => j.id === jobId) ?? null;
  }

  return {
    start() {
      for (const job of jobs) {
        const task = cron.schedule(
          job.schedule,
          () => {
            void executeJob(job.id);
          },
          job.cronOptions,
        );
        cronTasks.push(task);
      }
      logger.info(
        { jobs: jobs.map((j) => j.id), rebalanceCron, reflectionCron },
        "trigger scheduler started",
      );
    },

    stop() {
      for (const task of cronTasks) {
        task.stop();
      }
      cronTasks.length = 0;
    },

    status() {
      return mergeTriggerJobStates(dataDir, jobDefinitions());
    },

    pause(jobId: string) {
      pauseTriggerJob(dataDir, jobId);
    },

    resume(jobId: string) {
      resumeTriggerJob(dataDir, jobId);
    },

    runNow(jobId: string) {
      return executeJob(jobId);
    },

    isBootDryRunPending(jobId: string) {
      return bootDryRunPending.has(jobId);
    },
  };
}

export function resolveTriggersDataDir(dataDir: string): string {
  return join(dataDir, "triggers");
}
