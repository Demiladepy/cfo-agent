import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createDemoContext } from "../tools.js";
import { createDemoServer } from "../server.js";
import { loadEnv, resetEnvCache } from "../../config/env.js";
import { tailAuditLog } from "../../memory/index.js";
import "dotenv/config";

describe("demo confirm flow", () => {
  let dataDir: string;
  let killSwitchPath: string;
  let port: number;
  let context: ReturnType<typeof createDemoContext>;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "cfo-confirm-"));
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
    port = 38000 + Math.floor(Math.random() * 1000);
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

  it("returns pending id on send and completes after approval", async () => {
    const send = (await fetch(`${baseUrl}/api/demo/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountNgn: 50_000 }),
    }).then((r) => r.json())) as {
      confirmRequired: boolean;
      pendingConfirmationId: string;
      reason: string;
      caps: { wouldConsumeNgn: number };
    };

    expect(send.confirmRequired).toBe(true);
    expect(send.pendingConfirmationId).toBeTruthy();
    expect(send.reason).toContain("confirm threshold");
    expect(send.caps.wouldConsumeNgn).toBe(50_000);

    const pending = (await fetch(`${baseUrl}/api/confirm/pending`).then((r) =>
      r.json(),
    )) as { pending: Array<{ id: string }> };
    expect(pending.pending.some((p) => p.id === send.pendingConfirmationId)).toBe(true);

    const approved = (await fetch(
      `${baseUrl}/api/confirm/${send.pendingConfirmationId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "y" }),
      },
    ).then((r) => r.json())) as { ok: boolean; reference: string };

    expect(approved.ok).toBe(true);
    expect(approved.reference).toContain("dry-run");

    const audit = tailAuditLog(context.store, 20);
    const subtypes = audit
      .map((e) => {
        if (!e.metadata) return null;
        try {
          return (JSON.parse(e.metadata) as { auditSubtype?: string }).auditSubtype;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    expect(subtypes).toContain("confirmation_requested");
    expect(subtypes).toContain("confirmation_decided");
    expect(subtypes).toContain("confirmation_outcome");
  });

  it("returns 410 for expired confirmation", async () => {
    const send = (await fetch(`${baseUrl}/api/demo/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountNgn: 50_000 }),
    }).then((r) => r.json())) as { pendingConfirmationId: string };

    context.store.db
      .prepare(
        `UPDATE pending_confirmations SET expires_at = datetime('now', '-1 minute') WHERE id = ?`,
      )
      .run(send.pendingConfirmationId);

    const res = await fetch(`${baseUrl}/api/confirm/${send.pendingConfirmationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "y" }),
    });
    const body = (await res.json()) as { expired: boolean; error: string };

    expect(res.status).toBe(410);
    expect(body.expired).toBe(true);
    expect(body.error).toContain("expired");
  });

  it("denies approval when kill switch active", async () => {
    const send = (await fetch(`${baseUrl}/api/demo/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountNgn: 50_000 }),
    }).then((r) => r.json())) as { pendingConfirmationId: string };

    await fetch(`${baseUrl}/api/kill`, { method: "POST" });

    const res = await fetch(`${baseUrl}/api/confirm/${send.pendingConfirmationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "y" }),
    });
    const body = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("kill switch");
  });

  it("UI contract: pending endpoint exposes banner fields", async () => {
    await fetch(`${baseUrl}/api/demo/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountNgn: 50_000 }),
    });

    const pending = (await fetch(`${baseUrl}/api/confirm/pending`).then((r) =>
      r.json(),
    )) as {
      pending: Array<{
        id: string;
        reason: string;
        caps: { dailySpentNgn: number; wouldConsumeNgn: number };
        action: { intent: { amountNgn: number; recipientId: string } };
      }>;
    };

    const item = pending.pending[0];
    expect(item?.id).toBeTruthy();
    expect(item?.reason).toBeTruthy();
    expect(item?.action.intent.amountNgn).toBe(50_000);
    expect(item?.caps.wouldConsumeNgn).toBe(50_000);
  });
});
