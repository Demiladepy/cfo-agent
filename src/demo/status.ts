import { isKillSwitchActive } from "../policy/kill-switch.js";
import { isOk } from "../lib/result.js";
import type { Env } from "../config/env.js";
import type { AppContext } from "../app/create-tools.js";
import type { BalanceEntry } from "../wallet/types.js";

export type BalanceSource = "live" | "mock" | "unavailable";

export type DemoBalanceField = {
  value: number | null;
  source: BalanceSource;
  reason?: string;
};

export type IntegrationLayerStatus = "live" | "mock" | "missing" | "unavailable";

export type DemoIntegrationLayer = {
  id: string;
  label: string;
  status: IntegrationLayerStatus;
  reason?: string;
};

export type DemoStatusPayload = {
  dryRun: boolean;
  sandbox: boolean;
  killSwitchActive: boolean;
  policy: {
    perTxCapNgn: number;
    dailyCapNgn: number;
    confirmThresholdNgn: number;
  };
  balances: {
    ngn: DemoBalanceField;
    usdc: DemoBalanceField;
    eth: DemoBalanceField;
  };
  layers: DemoIntegrationLayer[];
  stack: Array<{ label: string; status: string }>;
};

function parseNumeric(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tokenBalance(
  entries: BalanceEntry[],
  symbol: string,
): { value: number | null; formatted: string | null } {
  const row = entries.find(
    (e) => e.symbol.toLowerCase() === symbol.toLowerCase(),
  );
  if (!row) {
    return { value: null, formatted: null };
  }
  return {
    value: parseNumeric(row.formatted),
    formatted: row.formatted,
  };
}

async function readWalletBalances(
  context: AppContext,
): Promise<{
  eth: DemoBalanceField;
  usdc: DemoBalanceField;
}> {
  if (context.mockWalletRpc) {
    const result = await context.tools.wallet.readBalances();
    if (!isOk(result)) {
      return {
        eth: {
          value: null,
          source: "unavailable",
          reason: result.error.message,
        },
        usdc: {
          value: null,
          source: "unavailable",
          reason: result.error.message,
        },
      };
    }
    const eth = tokenBalance(result.value, "ETH");
    const usdc = tokenBalance(result.value, "USDC");
    return {
      eth: {
        value: eth.value,
        source: "mock",
        reason: "mockWalletRpc enabled — balances are not from chain RPC",
      },
      usdc: {
        value: usdc.value,
        source: "mock",
        reason: "mockWalletRpc enabled — balances are not from chain RPC",
      },
    };
  }

  const result = await context.tools.wallet.readBalances();
  if (!isOk(result)) {
    const reason = result.error.message;
    return {
      eth: { value: null, source: "unavailable", reason },
      usdc: { value: null, source: "unavailable", reason },
    };
  }

  const eth = tokenBalance(result.value, "ETH");
  const usdc = tokenBalance(result.value, "USDC");
  return {
    eth: {
      value: eth.value,
      source: eth.value === null ? "unavailable" : "live",
      ...(eth.value === null ? { reason: "native balance not returned" } : {}),
    },
    usdc: {
      value: usdc.value,
      source: usdc.value === null ? "unavailable" : "live",
      ...(usdc.value === null ? { reason: "USDC balance not returned" } : {}),
    },
  };
}

async function readNgnBalance(context: AppContext): Promise<DemoBalanceField> {
  const result = await context.tools.index.getNgnBalance();
  if (!isOk(result)) {
    return {
      value: null,
      source: "unavailable",
      reason: result.error.message,
    };
  }

  if (result.value.simulated) {
    return {
      value: result.value.balanceNgn,
      source: "mock",
      reason: context.tools.integrations.index === "live"
        ? "Index MCP balance unavailable — simulated float"
        : "Index MCP not configured — simulated float",
    };
  }

  return {
    value: result.value.balanceNgn,
    source: "live",
  };
}

function buildLayers(context: AppContext, env: Env): DemoIntegrationLayer[] {
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY?.length);

  return [
    {
      id: "wallet",
      label: "Wallet RPC",
      status: context.mockWalletRpc ? "mock" : "live",
      ...(context.mockWalletRpc
        ? { reason: "mockWalletRpc enabled" }
        : {}),
    },
    {
      id: "index",
      label: "Index MCP",
      status:
        context.tools.integrations.index === "live" ? "live" : "mock",
      ...(context.tools.integrations.index === "mock"
        ? { reason: "INDEX_MCP_URL or INDEX_MCP_API_KEY not set" }
        : {}),
    },
    {
      id: "lifi",
      label: "LI.FI SDK",
      status: context.tools.integrations.lifi === "live" ? "live" : "mock",
      ...(context.tools.integrations.lifi === "mock"
        ? { reason: "LIFI_INTEGRATOR not set" }
        : {}),
    },
    {
      id: "anthropic",
      label: "Claude",
      status: hasAnthropic ? "live" : "missing",
      ...(!hasAnthropic ? { reason: "ANTHROPIC_API_KEY not set" } : {}),
    },
  ];
}

function buildStack(context: AppContext, env: Env): Array<{ label: string; status: string }> {
  const layers = buildLayers(context, env);
  const layerStatus = (id: string) => layers.find((l) => l.id === id)?.status ?? "missing";

  return [
    { label: "Policy + audit log", status: "real" },
    { label: "Agent orchestration", status: "real" },
    { label: "Kill switch", status: "real" },
    {
      label: "Paystack Index MCP",
      status: layerStatus("index") === "live" ? "real" : "simulated",
    },
    {
      label: "LI.FI SDK",
      status: layerStatus("lifi") === "live" ? "real" : "simulated",
    },
    {
      label: "Wallet (viem)",
      status: layerStatus("wallet") === "live" ? "real" : "simulated",
    },
    {
      label: "Claude agent",
      status: layerStatus("anthropic") === "live" ? "real" : "missing",
    },
    { label: "Off-ramp", status: "stub" },
  ];
}

export function computeSandboxMode(context: AppContext): boolean {
  return (
    context.dryRun ||
    context.mockWalletRpc ||
    context.tools.integrations.index === "mock" ||
    context.tools.integrations.lifi === "mock"
  );
}

export async function buildDemoStatus(
  context: AppContext,
  env: Env,
): Promise<DemoStatusPayload> {
  const cfg = context.tools.policyConfig;
  const walletBalances = await readWalletBalances(context);
  const ngn = await readNgnBalance(context);

  return {
    dryRun: context.dryRun,
    sandbox: computeSandboxMode(context),
    killSwitchActive: isKillSwitchActive(context.killSwitchPath),
    policy: {
      perTxCapNgn: cfg.per_tx_cap_ngn,
      dailyCapNgn: cfg.daily_cap_ngn,
      confirmThresholdNgn: cfg.confirm_threshold_ngn,
    },
    balances: {
      ngn,
      usdc: walletBalances.usdc,
      eth: walletBalances.eth,
    },
    layers: buildLayers(context, env),
    stack: buildStack(context, env),
  };
}
