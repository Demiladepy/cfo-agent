import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  activateKillSwitch,
  deactivateKillSwitch,
  isKillSwitchActive,
} from "../kill-switch.js";

describe("kill-switch module", () => {
  let testDir: string;
  let switchPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "cfo-kill-"));
    switchPath = join(testDir, "agent.kill");
    process.env["KILL_SWITCH_PATH"] = switchPath;
    deactivateKillSwitch(switchPath);
  });

  afterEach(() => {
    deactivateKillSwitch(switchPath);
    delete process.env["KILL_SWITCH_PATH"];
    rmSync(testDir, { recursive: true, force: true });
  });

  it("activates and deactivates kill switch file", () => {
    expect(isKillSwitchActive(switchPath)).toBe(false);
    activateKillSwitch(switchPath);
    expect(isKillSwitchActive(switchPath)).toBe(true);
    deactivateKillSwitch(switchPath);
    expect(isKillSwitchActive(switchPath)).toBe(false);
  });
});
