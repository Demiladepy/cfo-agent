import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Kill switch file location. See docs/questions.md — spec says /tmp/agent.kill;
 * we use os.tmpdir() for cross-platform support.
 */
export function getKillSwitchPath(): string {
  const override = process.env["KILL_SWITCH_PATH"];
  if (override && override.length > 0) {
    return override;
  }
  return join(tmpdir(), "agent.kill");
}

export function isKillSwitchActive(path = getKillSwitchPath()): boolean {
  return existsSync(path);
}

export function activateKillSwitch(path = getKillSwitchPath()): void {
  writeFileSync(path, new Date().toISOString(), "utf8");
}

export function deactivateKillSwitch(path = getKillSwitchPath()): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}
