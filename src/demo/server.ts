import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  activateKillSwitch,
  deactivateKillSwitch,
} from "../policy/kill-switch.js";
import { tailAuditLog } from "../memory/index.js";
import { executeSendNgnFlow, type AgentAction } from "../agent/runner.js";
import { runClaudeAgent } from "../agent/claude.js";
import { loadEnv } from "../config/env.js";
import type { AppContext } from "../app/create-tools.js";
import { buildDemoStatus } from "./status.js";
import {
  attachPriorActionsToPending,
  parsePendingForApi,
  resolvePendingConfirmation,
} from "../confirm/bridge.js";
import { listActivePendingConfirmations, getPendingConfirmation } from "../memory/pending-confirmations.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export type DemoServerOptions = {
  port: number;
  context: AppContext;
  webRoot: string;
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

function actionsToSteps(
  actions: AgentAction[],
  intent: { amountNgn: number; ngnBalanceNgn: number },
  options?: { awaitingConfirmation?: boolean; confirmReason?: string },
): Array<{ id: string; label: string; detail: string; status: "done" | "error" | "pending" }> {
  const steps: Array<{
    id: string;
    label: string;
    detail: string;
    status: "done" | "error" | "pending";
  }> = [
    {
      id: "balance",
      label: "Check NGN float",
      detail: `₦${intent.ngnBalanceNgn.toLocaleString()} available · need ₦${intent.amountNgn.toLocaleString()}`,
      status: "done",
    },
    {
      id: "policy",
      label: "Policy gate",
      detail: "Caps, allowlist, velocity — evaluated before any move",
      status: "done",
    },
  ];

  const shortfall = intent.amountNgn - intent.ngnBalanceNgn;
  const lifiReport = actions.find(
    (a) => a.type === "report" && a.message.includes("LI.FI"),
  );
  const offrampReport = actions.find(
    (a) => a.type === "report" && a.message.includes("off-ramp"),
  );
  if (shortfall > 0) {
    steps.push({
      id: "lifi",
      label: "LI.FI — route crypto liquidity",
      detail:
        lifiReport?.type === "report"
          ? lifiReport.message
          : `Quote & execute ~₦${shortfall.toLocaleString()} equivalent (dry-run)`,
      status: actions.some((a) => a.type === "insufficient_funds") ? "error" : "done",
    });
    steps.push({
      id: "offramp",
      label: "Off-ramp — USDC to NGN float",
      detail:
        offrampReport?.type === "report"
          ? offrampReport.message
          : `Convert ~₦${shortfall.toLocaleString()} to Index-funded float`,
      status: actions.some(
        (a) => a.type === "insufficient_funds" && a.message.includes("off-ramp"),
      )
        ? "error"
        : "done",
    });
  }

  const transfer = actions.find((a) => a.type === "transfer_complete");
  const failed = actions.find((a) => a.type === "insufficient_funds");
  const awaiting = options?.awaitingConfirmation;
  steps.push({
    id: "index",
    label: "Paystack Index — NGN transfer",
    detail: transfer
      ? `Complete · ref ${transfer.reference}${transfer.simulated ? " (simulated)" : ""}`
      : awaiting
        ? `Awaiting operator approval — ${options?.confirmReason ?? "policy confirm threshold"}`
        : failed?.type === "insufficient_funds"
          ? failed.message
          : "Pending",
    status: transfer ? "done" : awaiting ? "pending" : "error",
  });

  return steps;
}

function serveStatic(webRoot: string, pathname: string, res: ServerResponse): boolean {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(webRoot, safePath.replace(/^\/+/, ""));
  if (!filePath.startsWith(webRoot) || !existsSync(filePath)) {
    return false;
  }
  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  res.end(readFileSync(filePath));
  return true;
}

export function createDemoServer(options: DemoServerOptions) {
  const { context, port, webRoot } = options;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const method = req.method ?? "GET";

    try {
      if (method === "GET" && url.pathname === "/api/status") {
        const env = loadEnv();
        const status = await buildDemoStatus(context, env);
        return json(res, 200, status);
      }

      if (method === "GET" && url.pathname === "/api/audit") {
        const limit = Number(url.searchParams.get("limit") ?? "12");
        const entries = tailAuditLog(context.store, limit).reverse();
        return json(res, 200, {
          entries: entries.map((e) => ({
            id: e.id,
            timestamp: e.timestamp,
            action: e.action,
            decision: e.decision,
            reason: e.reason,
          })),
        });
      }

      if (method === "POST" && url.pathname === "/api/kill") {
        activateKillSwitch(context.killSwitchPath);
        return json(res, 200, { ok: true, killSwitchActive: true });
      }

      if (method === "POST" && url.pathname === "/api/resume") {
        deactivateKillSwitch(context.killSwitchPath);
        return json(res, 200, { ok: true, killSwitchActive: false });
      }

      if (method === "GET" && url.pathname === "/api/confirm/pending") {
        const rows = listActivePendingConfirmations(context.store);
        return json(res, 200, {
          pending: rows.map((row) => parsePendingForApi(row)),
        });
      }

      const confirmMatch = url.pathname.match(/^\/api\/confirm\/([^/]+)$/);
      if (method === "POST" && confirmMatch) {
        const pendingId = decodeURIComponent(confirmMatch[1] ?? "");
        const body = (await readJsonBody(req)) as { decision?: string };
        const decision = body.decision === "y" || body.decision === "n" ? body.decision : null;
        if (!decision) {
          return json(res, 400, { error: "decision must be 'y' or 'n'" });
        }

        const result = await resolvePendingConfirmation(
          {
            store: context.store,
            dryRun: context.dryRun,
            killSwitchPath: context.killSwitchPath,
            confirmBridge: context.confirmBridge,
            index: context.tools.index,
            tools: context.tools,
          },
          pendingId,
          decision,
        );

        if (!result.ok) {
          return json(res, result.status, {
            ok: false,
            error: result.error,
            ...(result.expired ? { expired: true } : {}),
          });
        }

        const approvedRow = getPendingConfirmation(context.store, pendingId);
        const parsed = approvedRow ? parsePendingForApi(approvedRow) : null;
        const ngnBalance =
          parsed?.action.type === "send_ngn_transfer"
            ? (parsed.action.ngnBalanceNgn ?? 0)
            : 0;
        const amountNgn =
          parsed?.action.type === "send_ngn_transfer"
            ? parsed.action.intent.amountNgn
            : parsed?.action.type === "rebalance_topup"
              ? parsed.action.deficitNgn
              : 0;

        return json(res, 200, {
          ok: true,
          reference: result.reference,
          simulated: result.simulated,
          actions: result.actions,
          steps: actionsToSteps(result.actions, {
            amountNgn,
            ngnBalanceNgn: ngnBalance,
          }),
        });
      }

      if (method === "GET" && url.pathname === "/api/triggers") {
        if (!context.triggers) {
          return json(res, 200, { enabled: false, jobs: [] });
        }
        return json(res, 200, {
          enabled: true,
          jobs: context.triggers.status(),
        });
      }

      const triggerMatch = url.pathname.match(/^\/api\/triggers\/([^/]+)\/(pause|resume|run)$/);
      if (method === "POST" && triggerMatch) {
        if (!context.triggers) {
          return json(res, 400, { error: "triggers not enabled" });
        }
        const jobId = decodeURIComponent(triggerMatch[1] ?? "");
        const action = triggerMatch[2];
        if (action === "pause") {
          context.triggers.pause(jobId);
          return json(res, 200, { ok: true, jobs: context.triggers.status() });
        }
        if (action === "resume") {
          context.triggers.resume(jobId);
          return json(res, 200, { ok: true, jobs: context.triggers.status() });
        }
        if (action === "run") {
          const job = await context.triggers.runNow(jobId);
          if (!job) return json(res, 404, { error: "unknown trigger job" });
          return json(res, 200, { ok: true, job, jobs: context.triggers.status() });
        }
      }

      if (method === "POST" && url.pathname === "/api/demo/send") {
        const body = (await readJsonBody(req)) as {
          amountNgn?: number;
          recipientId?: string;
          recipientCategory?: string;
          ngnBalanceNgn?: number;
        };

        const intent = {
          amountNgn: body.amountNgn ?? 50_000,
          recipientId: body.recipientId ?? "mom",
          recipientCategory: body.recipientCategory ?? "family",
          ...(body.ngnBalanceNgn !== undefined
            ? { ngnBalanceNgn: body.ngnBalanceNgn }
            : {}),
        };

        const floatBefore = await context.tools.index.getNgnBalance();
        const ngnForSteps = floatBefore.ok ? floatBefore.value.balanceNgn : 0;

        context.confirmBridge?.clearLastPending();

        const actions = await executeSendNgnFlow(
          context.tools,
          intent,
          context.dryRun,
        );

        const pendingId = context.confirmBridge?.lastPendingId ?? null;
        if (pendingId) {
          attachPriorActionsToPending(
            context.store,
            pendingId,
            actions.filter((a) => a.type !== "insufficient_funds"),
            ngnForSteps,
          );
          const pending = parsePendingForApi(
            getPendingConfirmation(context.store, pendingId)!,
          );
          return json(res, 202, {
            ok: false,
            confirmRequired: true,
            pendingConfirmationId: pendingId,
            reason: pending.reason,
            caps: pending.caps,
            action: pending.action,
            actions,
            steps: actionsToSteps(actions, {
              amountNgn: intent.amountNgn,
              ngnBalanceNgn: ngnForSteps,
            }, {
              awaitingConfirmation: true,
              confirmReason: pending.reason,
            }),
          });
        }

        const ok = actions.some((a) => a.type === "transfer_complete");
        return json(res, 200, {
          ok,
          actions,
          steps: actionsToSteps(actions, {
            amountNgn: intent.amountNgn,
            ngnBalanceNgn: ngnForSteps,
          }),
        });
      }

      if (method === "POST" && url.pathname === "/api/demo/airtime") {
        const body = (await readJsonBody(req)) as {
          phone?: string;
          amountNgn?: number;
        };
        const result = await context.tools.index.purchaseAirtime({
          phone: body.phone ?? "08012345678",
          amountNgn: body.amountNgn ?? 2_000,
          network: "mtn",
          idempotencyKey: crypto.randomUUID(),
        });

        return json(res, result.ok ? 200 : 400, {
          ok: result.ok,
          result: result.ok ? result.value : result.error,
        });
      }

      if (method === "POST" && url.pathname === "/api/chat") {
        const env = loadEnv();
        if (!env.ANTHROPIC_API_KEY) {
          return json(res, 400, { error: "ANTHROPIC_API_KEY not set" });
        }
        const body = (await readJsonBody(req)) as { message?: string };
        const message = body.message?.trim();
        if (!message) {
          return json(res, 400, { error: "message required" });
        }
        const result = await runClaudeAgent(
          {
            tools: context.tools,
            dryRun: context.dryRun,
            apiKey: env.ANTHROPIC_API_KEY,
            model: env.ANTHROPIC_MODEL,
          },
          message,
        );
        return json(res, 200, { ok: true, ...result });
      }

      if (method === "GET") {
        if (serveStatic(webRoot, url.pathname, res)) return;
      }

      json(res, 404, { error: "not found" });
    } catch (e) {
      json(res, 500, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return server;
}

export function resolveWebRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "web");
}
