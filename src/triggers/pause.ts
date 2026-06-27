import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function triggersPauseDir(dataDir: string): string {
  const dir = join(dataDir, "triggers");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function isTriggerJobPaused(dataDir: string, jobId: string): boolean {
  return existsSync(join(triggersPauseDir(dataDir), `${jobId}.pause`));
}

export function pauseTriggerJob(dataDir: string, jobId: string): void {
  writeFileSync(join(triggersPauseDir(dataDir), `${jobId}.pause`), new Date().toISOString(), "utf8");
}

export function resumeTriggerJob(dataDir: string, jobId: string): void {
  const path = join(triggersPauseDir(dataDir), `${jobId}.pause`);
  if (existsSync(path)) unlinkSync(path);
}
