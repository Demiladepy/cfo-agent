import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadEnv } from "../config/env.js";
import { executeSendNgnFlow, type AgentAction } from "../agent/runner.js";
import { buildDemoStatus } from "../demo/status.js";
import {
  attachPriorActionsToPending,
  parsePendingForApi,
  resolvePendingConfirmation,
} from "../confirm/bridge.js";
import { listActivePendingConfirmations } from "../memory/pending-confirmations.js";
import { tailAuditLog } from "../memory/index.js";
import {
  activateKillSwitch,
  deactivateKillSwitch,
  isKillSwitchActive,
} from "../policy/kill-switch.js";
import { isOk } from "../lib/result.js";
import { showPolicy } from "./policy.js";
import { formatAuditEntries } from "./audit.js";
import { type CliSession, createCliSession, resolveCliKillSwitchPath } from "./session.js";

const CHAIN_ALIASES: Record<string, { chainId: number; usdc: string }> = {
  sepolia: {
    chainId: 11155111,
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
};

export const HELP_TEXT = `CFO Agent REPL — commands:
  status                          wallet, NGN float, policy, integrations
  send <amountNgn> <recipientId>  canonical send flow (dry-run default)
  airtime <amountNgn> <phone>     Index airtime purchase
  quote <chain> <usdcAmount>      LI.FI quote only (e.g. quote sepolia 10)
  policy show                     print active policy YAML
  audit tail [n]                  last n audit entries (default 20)
  confirm list                    pending operator confirmations
  confirm <id> y|n                approve or deny a pending confirmation
  kill                            activate kill switch
  resume                          deactivate kill switch
  live on | live off              session live mode (requires LIVE_EXECUTION in .env)
  help                            this message
  exit                            quit`;

export type ReplWriter = (line: string) => void;

function writeln(write: ReplWriter, line: string): void {
  write(line);
}

function formatBalanceField(
  label: string,
  field: { value: number | null; source: string; reason?: string },
  suffix = "",
): string {
  if (field.value === null) {
    return `  ${label}: — (unavailable${field.reason ? ` — ${field.reason}` : ""})`;
  }
  const tag =
    field.source === "live" ? "live" : field.source === "mock" ? "mock" : field.source;
  const reason = field.reason ? ` — ${field.reason}` : "";
  return `  ${label}: ${field.value}${suffix} [${tag}]${reason}`;
}

function formatAction(action: AgentAction): string {
  switch (action.type) {
    case "transfer_complete":
      return `transfer complete · ref ${action.reference}${action.simulated ? " (simulated)" : ""}`;
    case "insufficient_funds":
      return `failed: ${action.message}`;
    case "injection_detected":
      return `injection detected: ${action.payload}`;
    default:
      return action.message;
  }
}

export async function handleReplCommand(
  session: CliSession,
  line: string,
  write: ReplWriter = (l) => console.log(l),
): Promise<boolean> {
  const trimmed = line.trim();
  if (!trimmed) return true;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0]?.toLowerCase() ?? "";

  if (cmd === "exit" || cmd === "quit") {
    return false;
  }

  if (cmd === "help") {
    writeln(write, HELP_TEXT);
    return true;
  }

  if (cmd === "status") {
    const env = session.env;
    const status = await buildDemoStatus(session.context, env);
    const ksPath = resolveCliKillSwitchPath(session);
    writeln(write, "=== Status ===");
    writeln(
      write,
      `Mode: ${session.dryRun ? "dry-run" : "live"} (session live: ${session.liveSessionEnabled ? "on" : "off"})`,
    );
    writeln(
      write,
      `Kill switch: ${isKillSwitchActive(ksPath) ? "ACTIVE" : "off"}`,
    );
    writeln(write, "Balances:");
    writeln(write, formatBalanceField("NGN float", status.balances.ngn));
    writeln(write, formatBalanceField("USDC", status.balances.usdc));
    writeln(write, formatBalanceField("ETH", status.balances.eth));
    writeln(write, "Policy:");
    writeln(
      write,
      `  per-tx cap: ₦${status.policy.perTxCapNgn.toLocaleString()}`,
    );
    writeln(
      write,
      `  daily cap: ₦${status.policy.dailyCapNgn.toLocaleString()}`,
    );
    writeln(
      write,
      `  confirm threshold: ₦${status.policy.confirmThresholdNgn.toLocaleString()}`,
    );
    writeln(write, "Integrations:");
    for (const layer of status.layers) {
      const note = layer.reason ? ` — ${layer.reason}` : "";
      writeln(write, `  ${layer.label}: ${layer.status}${note}`);
    }
    return true;
  }

  if (cmd === "send") {
    const amountNgn = Number(parts[1]);
    const recipientId = parts[2];
    if (!Number.isFinite(amountNgn) || !recipientId) {
      writeln(write, "Usage: send <amountNgn> <recipientId>");
      return true;
    }

    session.context.confirmBridge?.clearLastPending();
    const actions = await executeSendNgnFlow(
      session.context.tools,
      {
        amountNgn,
        recipientId,
        recipientCategory: "family",
      },
      session.context.dryRun,
    );

    const pendingId = session.context.confirmBridge?.lastPendingId;
    if (pendingId) {
      attachPriorActionsToPending(
        session.context.store,
        pendingId,
        actions.filter((a) => a.type !== "insufficient_funds"),
        0,
      );
      writeln(write, `Confirmation required — pending id: ${pendingId}`);
      writeln(write, `Run: confirm ${pendingId} y`);
    }

    for (const action of actions) {
      writeln(write, formatAction(action));
    }
    return true;
  }

  if (cmd === "airtime") {
    const amountNgn = Number(parts[1]);
    const phone = parts[2];
    if (!Number.isFinite(amountNgn) || !phone) {
      writeln(write, "Usage: airtime <amountNgn> <phone>");
      return true;
    }

    const result = await session.context.tools.index.purchaseAirtime({
      phone,
      amountNgn,
      network: "mtn",
      idempotencyKey: randomUUID(),
    });

    if (isOk(result)) {
      writeln(
        write,
        `airtime ok · ref ${result.value.reference}${result.value.simulated ? " (simulated)" : ""}`,
      );
    } else {
      writeln(write, `airtime failed: ${result.error.message}`);
    }
    return true;
  }

  if (cmd === "quote") {
    const chainKey = parts[1]?.toLowerCase();
    const amountUsdc = Number(parts[2]);
    const chain = chainKey ? CHAIN_ALIASES[chainKey] : undefined;
    if (!chain || !Number.isFinite(amountUsdc)) {
      writeln(write, "Usage: quote <chain> <usdcAmount>  (chain: sepolia)");
      return true;
    }

    const fromAmount = String(Math.round(amountUsdc * 1_000_000));
    const quote = await session.context.tools.lifi.quote({
      fromChainId: chain.chainId,
      toChainId: chain.chainId,
      fromToken: chain.usdc,
      toToken: chain.usdc,
      fromAmount,
    });

    if (!isOk(quote)) {
      writeln(write, `quote failed: ${quote.error.message}`);
      return true;
    }

    const route = quote.value;
    const totalFees = route.gasCostUsd + route.feeCostUsd;
    writeln(write, "=== LI.FI quote ===");
    writeln(write, `  route id: ${route.id}`);
    writeln(write, `  hops: ${route.hops}`);
    writeln(write, `  slippage: ${route.slippageBps} bps`);
    writeln(write, `  gas: $${route.gasCostUsd.toFixed(4)}`);
    writeln(write, `  fees: $${route.feeCostUsd.toFixed(4)}`);
    writeln(write, `  total fees: $${totalFees.toFixed(4)}`);
    writeln(write, `  from: ${route.fromAmount} (minor)`);
    writeln(write, `  to: ${route.toAmount} (min ${route.toAmountMin})`);
    return true;
  }

  if (cmd === "policy" && parts[1] === "show") {
    const result = showPolicy(session.env);
    if (!result.ok) {
      writeln(write, result.error);
      return true;
    }
    writeln(write, JSON.stringify(result.policy, null, 2));
    writeln(write, `(source: ${result.path})`);
    return true;
  }

  if (cmd === "audit" && parts[1] === "tail") {
    const limit = parts[2] !== undefined ? Number(parts[2]) : 20;
    const entries = tailAuditLog(session.context.store, limit);
    const lines = formatAuditEntries(entries);
    if (lines.length === 0) {
      writeln(write, "No audit log entries.");
    } else {
      for (const entryLine of lines) writeln(write, entryLine);
    }
    return true;
  }

  if (cmd === "confirm") {
    if (parts[1] === "list") {
      const rows = listActivePendingConfirmations(session.context.store);
      if (rows.length === 0) {
        writeln(write, "No pending confirmations.");
        return true;
      }
      for (const row of rows) {
        const item = parsePendingForApi(row);
        writeln(
          write,
          `${item.id} · ₦${item.action.intent.amountNgn.toLocaleString()} → ${item.action.intent.recipientId} · ${item.reason}`,
        );
      }
      return true;
    }

    const pendingId = parts[1];
    const decision = parts[2]?.toLowerCase();
    if (!pendingId || (decision !== "y" && decision !== "n")) {
      writeln(write, "Usage: confirm list | confirm <id> y|n");
      return true;
    }

    const result = await resolvePendingConfirmation(
      {
        store: session.context.store,
        dryRun: session.context.dryRun,
        killSwitchPath: session.context.killSwitchPath,
        confirmBridge: session.context.confirmBridge,
        index: session.context.tools.index,
      },
      pendingId,
      decision,
    );

    if (result.ok) {
      writeln(
        write,
        `approved · ref ${result.reference}${result.simulated ? " (simulated)" : ""}`,
      );
      for (const action of result.actions) {
        writeln(write, formatAction(action));
      }
    } else {
      writeln(write, `confirm failed: ${result.error}`);
    }
    return true;
  }

  if (cmd === "kill") {
    const ksPath = resolveCliKillSwitchPath(session);
    activateKillSwitch(ksPath);
    writeln(write, `Kill switch activated at ${ksPath}`);
    return true;
  }

  if (cmd === "resume") {
    const ksPath = resolveCliKillSwitchPath(session);
    deactivateKillSwitch(ksPath);
    writeln(write, `Kill switch deactivated at ${ksPath}`);
    return true;
  }

  if (cmd === "live") {
    const mode = parts[1]?.toLowerCase();
    if (mode === "on") {
      const result = session.setLiveEnabled(true);
      if (!result.ok) {
        writeln(write, result.error);
      } else {
        writeln(write, "Live session enabled — money moves are real when integrations allow");
      }
      return true;
    }
    if (mode === "off") {
      session.setLiveEnabled(false);
      writeln(write, "Live session disabled — dry-run mode");
      return true;
    }
    writeln(write, "Usage: live on | live off");
    return true;
  }

  writeln(write, `Unknown command: ${cmd}. Type help for commands.`);
  return true;
}

export async function runReplLoop(session: CliSession): Promise<void> {
  const writer: ReplWriter = (line) => console.log(line);
  const prompt = "cfo> ";

  writer("CFO Agent REPL — type help for commands, exit to quit");
  writer(`Mode: ${session.dryRun ? "dry-run" : "live"}`);

  const rl = createInterface({ input, output, terminal: true });
  try {
    while (true) {
      const line = await rl.question(prompt);
      const cont = await handleReplCommand(session, line, writer);
      if (!cont) break;
    }
  } finally {
    rl.close();
  }
}

export async function runReplFromScript(
  session: CliSession,
  lines: string[],
  write: ReplWriter = () => {},
): Promise<string[]> {
  const outputLines: string[] = [];
  const capture: ReplWriter = (line) => {
    outputLines.push(line);
    write(line);
  };

  for (const line of lines) {
    const cont = await handleReplCommand(session, line, capture);
    if (!cont) break;
  }

  return outputLines;
}

export function main(argv: string[] = process.argv.slice(2)): void {
  const startLive = argv.includes("--live");
  const env = loadEnv();
  const session = createCliSession({
    env,
    sessionLive: startLive && env.LIVE_EXECUTION,
    dryRun: !(startLive && env.LIVE_EXECUTION),
  });

  const shutdown = () => {
    session.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);

  runReplLoop(session).finally(() => {
    session.close();
  });
}
