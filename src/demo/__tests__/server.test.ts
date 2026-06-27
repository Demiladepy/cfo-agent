import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createDemoContext } from "../tools.js";
import { createDemoServer } from "../server.js";
import { loadEnv, resetEnvCache } from "../../config/env.js";
import "dotenv/config";

describe("demo server", () => {
  let dataDir: string;
  let killSwitchPath: string;
  let port: number;
  let context: ReturnType<typeof createDemoContext>;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "cfo-demo-"));
    killSwitchPath = join(dataDir, "agent.kill");
    process.env["KILL_SWITCH_PATH"] = killSwitchPath;
    resetEnvCache();
    const env = loadEnv();
    context = createDemoContext({
      dataDir,
      killSwitchPath,
      env,
      dryRun: true,
      mockWalletRpc: true,
    });
    port = 39000 + Math.floor(Math.random() * 1000);
    server = createDemoServer({
      port,
      context,
      webRoot: join(process.cwd(), "web"),
    });
    await new Promise<void>((resolve) => server.listen(port, resolve));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    context.close();
    delete process.env["KILL_SWITCH_PATH"];
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns demo status payload", async () => {
    const status = (await fetch(`${baseUrl}/api/status`).then((r) =>
      r.json(),
    )) as {
      dryRun: boolean;
      sandbox: boolean;
      balances: {
        usdc: { value: number | null; source: string };
        eth: { value: number | null; source: string };
      };
      layers: Array<{ id: string }>;
    };

    expect(status.dryRun).toBe(true);
    expect(status.sandbox).toBe(true);
    expect(status.balances.usdc.source).toBe("mock");
    expect(status.balances.usdc.value).toBe(25);
    expect(status.balances.eth.value).toBe(0.001);
    expect(status.layers.some((l) => l.id === "wallet")).toBe(true);
  });

  it("blocks send when kill switch active", async () => {
    await fetch(`${baseUrl}/api/kill`, { method: "POST" });
    const result = (await fetch(`${baseUrl}/api/demo/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountNgn: 5_000 }),
    }).then((r) => r.json())) as { ok: boolean };
    expect(result.ok).toBe(false);
  });

  it("completes sub-threshold send without confirmation", async () => {
    const result = (await fetch(`${baseUrl}/api/demo/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountNgn: 5_000 }),
    }).then((r) => r.json())) as {
      ok: boolean;
      confirmRequired?: boolean;
    };

    expect(result.confirmRequired).toBeFalsy();
    expect(result.ok).toBe(true);
  });
});
