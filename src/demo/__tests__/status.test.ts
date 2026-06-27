import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildDemoStatus, computeSandboxMode } from "../status.js";
import { createDemoContext } from "../tools.js";
import { loadEnv, resetEnvCache } from "../../config/env.js";
import { err } from "../../lib/result.js";
import "dotenv/config";

describe("buildDemoStatus", () => {
  let dataDir: string;
  let killSwitchPath: string;
  let context: ReturnType<typeof createDemoContext>;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "cfo-status-"));
    killSwitchPath = join(dataDir, "agent.kill");
    process.env["KILL_SWITCH_PATH"] = killSwitchPath;
    resetEnvCache();
  });

  afterEach(() => {
    context?.close();
    delete process.env["KILL_SWITCH_PATH"];
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns mock wallet balances when mockWalletRpc is enabled", async () => {
    const env = loadEnv();
    context = createDemoContext({
      dataDir,
      killSwitchPath,
      env,
      dryRun: true,
      mockWalletRpc: true,
    });

    const status = await buildDemoStatus(context, env);

    expect(status.balances.eth.source).toBe("mock");
    expect(status.balances.usdc.source).toBe("mock");
    expect(status.balances.eth.value).toBe(0.001);
    expect(status.balances.usdc.value).toBe(25);
    expect(status.sandbox).toBe(true);
    expect(status.layers.find((l) => l.id === "wallet")?.status).toBe("mock");
  });

  it("returns null balances with reason when wallet read fails", async () => {
    const env = loadEnv();
    context = createDemoContext({
      dataDir,
      killSwitchPath,
      env,
      dryRun: true,
      mockWalletRpc: true,
    });

    vi.spyOn(context.tools.wallet, "readBalances").mockResolvedValue(
      err({ code: "RPC_ERROR", message: "connection refused" }),
    );

    const status = await buildDemoStatus(context, env);

    expect(status.balances.eth).toEqual({
      value: null,
      source: "unavailable",
      reason: "connection refused",
    });
    expect(status.balances.usdc).toEqual({
      value: null,
      source: "unavailable",
      reason: "connection refused",
    });
  });

  it("marks sandbox when any integration layer is mocked", () => {
    const env = loadEnv();
    context = createDemoContext({
      dataDir,
      killSwitchPath,
      env,
      dryRun: false,
      mockWalletRpc: false,
    });

    expect(computeSandboxMode(context)).toBe(true);
  });
});
