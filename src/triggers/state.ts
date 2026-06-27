import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type TriggerJobOutcome =
  | "skipped_paused"
  | "float_sufficient"
  | "executed"
  | "simulated"
  | "denied"
  | "confirm_pending"
  | "error";

export type TriggerJobState = {
  id: string;
  label: string;
  schedule: string;
  paused: boolean;
  lastRun: string | null;
  nextRun: string | null;
  lastOutcome: TriggerJobOutcome | null;
  lastDetail: string | null;
};

type TriggerStateFile = {
  jobs: Record<string, Omit<TriggerJobState, "id" | "label" | "schedule" | "paused">>;
};

function statePath(dataDir: string): string {
  const dir = join(dataDir, "triggers");
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

function readRaw(dataDir: string): TriggerStateFile {
  const path = statePath(dataDir);
  if (!existsSync(path)) return { jobs: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as TriggerStateFile;
  } catch {
    return { jobs: {} };
  }
}

function writeRaw(dataDir: string, data: TriggerStateFile): void {
  writeFileSync(statePath(dataDir), JSON.stringify(data, null, 2), "utf8");
}

export function updateTriggerJobRun(
  dataDir: string,
  jobId: string,
  update: {
    lastRun: string;
    nextRun: string | null;
    lastOutcome: TriggerJobOutcome;
    lastDetail: string;
  },
): void {
  const raw = readRaw(dataDir);
  raw.jobs[jobId] = {
    lastRun: update.lastRun,
    nextRun: update.nextRun,
    lastOutcome: update.lastOutcome,
    lastDetail: update.lastDetail,
  };
  writeRaw(dataDir, raw);
}

export function mergeTriggerJobStates(
  dataDir: string,
  definitions: Array<{ id: string; label: string; schedule: string; paused: boolean }>,
): TriggerJobState[] {
  const raw = readRaw(dataDir);
  return definitions.map((def) => {
    const saved = raw.jobs[def.id];
    return {
      id: def.id,
      label: def.label,
      schedule: def.schedule,
      paused: def.paused,
      lastRun: saved?.lastRun ?? null,
      nextRun: saved?.nextRun ?? null,
      lastOutcome: saved?.lastOutcome ?? null,
      lastDetail: saved?.lastDetail ?? null,
    };
  });
}
