import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { sepolia } from "viem/chains";
import type { Env } from "../config/env.js";
import { closeDatabase, migrate, openDatabase } from "../db/index.js";
import { createMemoryStore, type MemoryStore } from "../memory/index.js";
import { createPolicyEngineWithAudit } from "../policy/index.js";
import { isKillSwitchActive } from "../policy/kill-switch.js";
import { loadPolicyFromObject, loadPolicyFile, resolvePolicyPath } from "../policy/config.js";
import { createLifiClient } from "../lifi/client.js";
import { resolveLifiSdk } from "../lifi/resolve.js";
import { createIndexClient } from "../index/client.js";
import { resolveIndexMcp } from "../index/resolve.js";
import { createOfframpClient } from "../offramp/client.js";
import { resolveOfframpProvider } from "../offramp/providers/factory.js";
import { createFxService } from "../fx/rate.js";
import { createWallet } from "../wallet/wallet.js";
import { encryptPrivateKey, decryptPrivateKey } from "../wallet/keystore.js";
import type { KeystoreFile } from "../wallet/types.js";
import type { AgentTools } from "../agent/runner.js";
import type { PolicyConfig } from "../policy/types.js";
import type { PolicyEngine } from "../policy/engine.js";
import type { ConfirmBridge } from "../confirm/bridge.js";
import { createConfirmBridge } from "../confirm/bridge.js";
import { createTriggerManager, type TriggerManager } from "../triggers/manager.js";

export type AppTools = AgentTools & {
  policyConfig: PolicyConfig;
  integrations: {
    index: "live" | "mock";
    lifi: "live" | "mock";
  };
};

export type AppContext = {
  tools: AppTools;
  store: MemoryStore;
  dryRun: boolean;
  killSwitchPath: string;
  mockWalletRpc: boolean;
  confirmBridge: ConfirmBridge | null;
  triggers: TriggerManager | null;
  close: () => void;
};

const DEMO_POLICY: PolicyConfig = {
  per_tx_cap_ngn: 500_000,
  daily_cap_ngn: 2_000_000,
  weekly_cap_ngn: 5_000_000,
  confirm_threshold_ngn: 50_000,
  velocity: { max_actions: 100, window_seconds: 3600 },
  allowlist: {
    crypto_addresses: ["0x0000000000000000000000000000000000000001"],
    index_recipient_categories: ["family", "airtime", "food", "bills"],
  },
  category_caps: { airtime: { daily_ngn: 20_000 }, offramp: { daily_ngn: 1_000_000 } },
};

function ensureDemoKeystore(path: string, passphrase: string): void {
  if (existsSync(path)) return;
  mkdirSync(join(path, ".."), { recursive: true });
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  writeFileSync(
    path,
    JSON.stringify(encryptPrivateKey(key, passphrase, account.address)),
  );
}

function buildWalletClientFactory(
  keystorePath: string,
  passphrase: string,
): () => Promise<WalletClient> {
  return async () => {
    const raw = JSON.parse(readFileSync(keystorePath, "utf8")) as KeystoreFile;
    const decrypted = decryptPrivateKey(raw, passphrase);
    if (!decrypted.ok) throw new Error(decrypted.error.message);
    const account = privateKeyToAccount(decrypted.value as `0x${string}`);
    return createWalletClient({
      account,
      chain: sepolia,
      transport: http(),
    });
  };
}

export function createAppContext(options: {
  env: Env;
  dataDir: string;
  killSwitchPath: string;
  dryRun?: boolean;
  useDemoPolicy?: boolean;
  mockWalletRpc?: boolean;
  enableConfirmBridge?: boolean;
  enableTriggers?: boolean;
}): AppContext {
  const { env } = options;
  const dryRun = options.dryRun ?? !env.LIVE_EXECUTION;

  mkdirSync(options.dataDir, { recursive: true });
  const dbPath = join(options.dataDir, "agent.db");
  const db = openDatabase(dbPath);
  migrate(db);
  const store = createMemoryStore(db);

  let policyConfig: PolicyConfig;
  if (options.useDemoPolicy) {
    const loaded = loadPolicyFromObject(DEMO_POLICY);
    if (!loaded.ok) throw new Error(loaded.error.message);
    policyConfig = loaded.value;
  } else {
    const pathResult = resolvePolicyPath(env.POLICY_PATH);
    if (!pathResult.ok) {
      const fallback = loadPolicyFromObject(DEMO_POLICY);
      if (!fallback.ok) throw new Error(fallback.error.message);
      policyConfig = fallback.value;
    } else {
      const loaded = loadPolicyFile(pathResult.value);
      if (!loaded.ok) throw new Error(loaded.error.message);
      policyConfig = loaded.value;
    }
  }

  const policy: PolicyEngine = createPolicyEngineWithAudit({
    config: policyConfig,
    store,
    isKillSwitchActive: () => isKillSwitchActive(options.killSwitchPath),
  });

  const confirmBridge =
    options.enableConfirmBridge === false
      ? null
      : createConfirmBridge({
          store,
          killSwitchPath: options.killSwitchPath,
          policyConfig,
        });

  const keystorePath = join(options.dataDir, "keystore.json");
  const passphrase = env.WALLET_PASSPHRASE ?? "demo-pass";
  ensureDemoKeystore(keystorePath, passphrase);

  const walletKeystore = existsSync(env.WALLET_KEYSTORE_PATH)
    ? env.WALLET_KEYSTORE_PATH
    : keystorePath;

  const wallet = createWallet({
    env: {
      WALLET_KEYSTORE_PATH: walletKeystore,
      WALLET_PASSPHRASE: passphrase,
      WALLET_CONFIG_PATH: env.WALLET_CONFIG_PATH ?? "config/wallet.example.yaml",
      LIVE_EXECUTION: env.LIVE_EXECUTION,
    },
    dryRun,
    createPublicClient: options.mockWalletRpc
      ? () =>
          ({
            async getBalance() {
              return 1_000_000_000_000_000n;
            },
            async readContract() {
              return 25_000_000n;
            },
          }) as unknown as PublicClient
      : undefined,
  });

  const addressResult = wallet.getAddress();
  const fromAddress = addressResult.ok ? addressResult.value : undefined;
  const getWalletClient =
    !dryRun && env.WALLET_PASSPHRASE
      ? buildWalletClientFactory(walletKeystore, env.WALLET_PASSPHRASE)
      : undefined;

  const { sdk: lifiSdk, mode: lifiMode } = resolveLifiSdk(env, {
    fromAddress,
    getWalletClient,
  });

  const lifi = createLifiClient({
    sdk: lifiSdk,
    policy,
    env: {
      LIVE_EXECUTION: env.LIVE_EXECUTION,
      LIFI_CONFIG_PATH: env.LIFI_CONFIG_PATH ?? "config/lifi.example.yaml",
    },
    dryRun,
  });

  const { mcp, mode: indexMode } = resolveIndexMcp(env);
  const index = createIndexClient({
    mcp,
    policy,
    store,
    env: { LIVE_EXECUTION: env.LIVE_EXECUTION },
    dryRun,
    liveMcp: indexMode === "live",
    ...(confirmBridge
      ? { onConfirmRequired: (ctx) => confirmBridge.onConfirmRequired(ctx) }
      : {}),
  });

  const offrampProvider = resolveOfframpProvider({ env });
  const offramp = createOfframpClient({
    provider: offrampProvider,
    policy,
    memory: store,
    env: { LIVE_EXECUTION: env.LIVE_EXECUTION },
    dryRun,
  });

  const fx = createFxService({
    getRateFromProvider: offrampProvider.getUsdToNgnRate,
    fallbackUsdNgn: env.FX_FALLBACK_USD_NGN ?? 1500,
  });

  const tools: AppTools = {
    wallet,
    lifi,
    index,
    offramp,
    fx,
    policy,
    memory: store,
    policyConfig,
    integrations: { index: indexMode, lifi: lifiMode },
  };

  const triggersEnabled =
    options.enableTriggers ?? (env.TRIGGERS_ENABLED && env.NODE_ENV !== "test");

  const ctx: AppContext = {
    tools,
    store,
    dryRun,
    killSwitchPath: options.killSwitchPath,
    mockWalletRpc: options.mockWalletRpc ?? false,
    confirmBridge,
    triggers: null,
    close: () => {
      ctx.triggers?.stop();
      closeDatabase(db);
    },
  };

  if (triggersEnabled) {
    ctx.triggers = createTriggerManager({
      context: ctx,
      env,
      dataDir: options.dataDir,
    });
    ctx.triggers.start();
  }

  return ctx;
}
