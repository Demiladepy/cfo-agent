import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resetEnvCache } from "../../config/env.js";
import { createAppContext } from "../../app/create-tools.js";
import { deactivateKillSwitch } from "../../policy/kill-switch.js";
import * as rebalanceFlow from "../rebalance-flow.js";
import {
  BOOT_DRY_RUN_LOG,
  createTriggerManager,
  REBALANCE_JOB_ID,
} from "../manager.js";

describe("trigger manager", () => {
  let dataDir: string;
  let killSwitchPath: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "cfo-triggers-"));
    killSwitchPath = join(dataDir, "agent.kill");
    process.env["KILL_SWITCH_PATH"] = killSwitchPath;
    process.env["NODE_ENV"] = "development";
    process.env["LOG_LEVEL"] = "silent";
    process.env["LIVE_EXECUTION"] = "true";
    process.env["TRIGGERS_ENABLED"] = "false";
    delete process.env["INDEX_MCP_URL"];
    delete process.env["INDEX_MCP_API_KEY"];
    resetEnvCache();
    deactivateKillSwitch(killSwitchPath);
  });

  afterEach(() => {
    delete process.env["KILL_SWITCH_PATH"];
    delete process.env["LIVE_EXECUTION"];
    delete process.env["TRIGGERS_ENABLED"];
    rmSync(dataDir, { recursive: true, force: true });
    resetEnvCache();
    vi.restoreAllMocks();
  });

  it("first run after boot forces dry-run even when LIVE_EXECUTION is true", async () => {
    const env = (await import("../../config/env.js")).loadEnv();
    const context = createAppContext({
      env,
      dataDir,
      killSwitchPath,
      dryRun: false,
      mockWalletRpc: true,
      useDemoPolicy: true,
      enableTriggers: false,
    });

    const manager = createTriggerManager({ context, env, dataDir });
    const spy = vi.spyOn(rebalanceFlow, "executeRebalanceTopup");

    vi.spyOn(context.tools.index, "getNgnBalance").mockResolvedValue({
      ok: true,
      value: { balanceNgn: 30_000, simulated: true },
    });

    expect(manager.isBootDryRunPending(REBALANCE_JOB_ID)).toBe(true);

    await manager.runNow(REBALANCE_JOB_ID);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );

    await manager.runNow(REBALANCE_JOB_ID);
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ dryRun: false }),
    );

    context.close();
  });

  it("fails boot dry-run test if rule removed from log constant", () => {
    expect(BOOT_DRY_RUN_LOG).toContain("dry-run on boot");
    expect(BOOT_DRY_RUN_LOG).toContain("{name}");
  });

  it("pause and resume via file flag", async () => {
    const env = (await import("../../config/env.js")).loadEnv();
    const context = createAppContext({
      env,
      dataDir,
      killSwitchPath,
      dryRun: true,
      mockWalletRpc: true,
      useDemoPolicy: true,
      enableTriggers: false,
    });

    const manager = createTriggerManager({ context, env, dataDir });
    manager.pause(REBALANCE_JOB_ID);
    const paused = await manager.runNow(REBALANCE_JOB_ID);
    expect(paused?.lastOutcome).toBe("skipped_paused");

    manager.resume(REBALANCE_JOB_ID);
    vi.spyOn(context.tools.index, "getNgnBalance").mockResolvedValue({
      ok: true,
      value: { balanceNgn: 150_000, simulated: true },
    });
    const ok = await manager.runNow(REBALANCE_JOB_ID);
    expect(ok?.lastOutcome).toBe("float_sufficient");

    context.close();
  });
});

describe("rebalance flow under policy", () => {
  let dataDir: string;
  let killSwitchPath: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "cfo-triggers-flow-"));
    killSwitchPath = join(dataDir, "agent.kill");
    process.env["KILL_SWITCH_PATH"] = killSwitchPath;
    process.env["NODE_ENV"] = "development";
    process.env["LOG_LEVEL"] = "silent";
    delete process.env["INDEX_MCP_URL"];
    resetEnvCache();
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    resetEnvCache();
  });

  it("routes low balance through policy and audit when below confirm threshold", async () => {
    const env = (await import("../../config/env.js")).loadEnv();
    const context = createAppContext({
      env,
      dataDir,
      killSwitchPath,
      dryRun: true,
      mockWalletRpc: true,
      useDemoPolicy: true,
      enableTriggers: false,
    });

    vi.spyOn(context.tools.index, "getNgnBalance").mockResolvedValue({
      ok: true,
      value: { balanceNgn: 90_000, simulated: true },
    });

    const result = await rebalanceFlow.executeRebalanceTopup({
      tools: context.tools,
      store: context.store,
      policyConfig: context.tools.policyConfig,
      targetNgnFloat: 100_000,
      dryRun: true,
    });

    expect(result.outcome).toBe("simulated");

    const audit = context.store.db
      .prepare("SELECT action, decision FROM audit_log ORDER BY id DESC LIMIT 5")
      .all() as Array<{ action: string; decision: string }>;

    expect(audit.some((a) => a.action === "trigger.rebalance")).toBe(true);

    context.close();
  }, 30_000);
});
