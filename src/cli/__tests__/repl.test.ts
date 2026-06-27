import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resetEnvCache } from "../../config/env.js";
import { createCliSession } from "../session.js";
import { runReplFromScript } from "../repl.js";
import { tailAuditLog } from "../../memory/index.js";

describe("cli repl", () => {
  let dataDir: string;
  let dbPath: string;
  let killSwitchPath: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "cfo-repl-"));
    dbPath = join(dataDir, "agent.db");
    killSwitchPath = join(dataDir, "agent.kill");
    process.env["DATABASE_PATH"] = dbPath;
    process.env["KILL_SWITCH_PATH"] = killSwitchPath;
    process.env["NODE_ENV"] = "test";
    process.env["LOG_LEVEL"] = "silent";
    process.env["LIVE_EXECUTION"] = "false";
    process.env["POLICY_PATH"] = join(process.cwd(), "config", "policy.example.yaml");
    delete process.env["INDEX_MCP_URL"];
    delete process.env["INDEX_MCP_API_KEY"];
    delete process.env["LIFI_INTEGRATOR"];
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env["DATABASE_PATH"];
    delete process.env["KILL_SWITCH_PATH"];
    delete process.env["POLICY_PATH"];
    delete process.env["LIVE_EXECUTION"];
    rmSync(dataDir, { recursive: true, force: true });
    resetEnvCache();
  });

  it(
    "status shows balances with source markers",
    async () => {
      const session = createCliSession({ dataDir, killSwitchPath, mockWalletRpc: true });
      try {
        const lines = await runReplFromScript(session, ["status", "exit"]);
        const text = lines.join("\n");
        expect(text).toContain("=== Status ===");
        expect(text).toContain("dry-run");
        expect(text).toMatch(/USDC:.*\[mock\]/);
        expect(text).toContain("Integrations:");
      } finally {
        session.close();
      }
    },
    30_000,
  );

  it(
    "send flows through policy, wallet, LI.FI mock, and Index mock with audit trail",
    async () => {
      const session = createCliSession({ dataDir, killSwitchPath, mockWalletRpc: true });
      try {
        const lines = await runReplFromScript(session, [
          "send 5000 mom",
          "audit tail 30",
          "exit",
        ]);

        const text = lines.join("\n");
        expect(text).toContain("transfer complete");

        const audit = tailAuditLog(session.context.store, 30);
        const decisions = audit.map((e) => e.decision);
        expect(decisions).toContain("allow");

        const actions = audit.map((e) => e.action);
        expect(actions).toContain("transfer");
      } finally {
        session.close();
      }
    },
    30_000,
  );

  it(
    "quote prints route summary without executing",
    async () => {
      const session = createCliSession({ dataDir, killSwitchPath, mockWalletRpc: true });
      try {
        const lines = await runReplFromScript(session, ["quote sepolia 10", "exit"]);
        const text = lines.join("\n");
        expect(text).toContain("=== LI.FI quote ===");
        expect(text).toContain("hops:");
        expect(text).toContain("slippage:");
        expect(text).toContain("total fees:");
      } finally {
        session.close();
      }
    },
    30_000,
  );

  it(
    "live on is blocked when LIVE_EXECUTION env is false",
    async () => {
      const session = createCliSession({ dataDir, killSwitchPath, mockWalletRpc: true });
      try {
        const lines = await runReplFromScript(session, ["live on", "exit"]);
        expect(lines.join("\n")).toContain("LIVE_EXECUTION is not true");
      } finally {
        session.close();
      }
    },
    30_000,
  );
});
