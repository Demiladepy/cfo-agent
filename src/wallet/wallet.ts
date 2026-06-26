import { readFileSync, existsSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { Env } from "../config/env.js";
import { isLiveExecutionAllowed } from "../lib/execution.js";
import { logExternalCall } from "../lib/logger.js";
import { err, ok, type Result } from "../lib/result.js";
import { loadWalletConfig } from "./config.js";
import { decryptPrivateKey, scrubHexKey } from "./keystore.js";
import {
  keystoreFileSchema,
  type BalanceEntry,
  type ChainConfig,
  type KeystoreFile,
  type SendParams,
  type SendResult,
  type WalletConfig,
  type WalletError,
} from "./types.js";

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const CHAIN_MAP: Record<number, Chain> = {
  [sepolia.id]: sepolia,
};

export type WalletDeps = {
  env: Pick<Env, "WALLET_KEYSTORE_PATH" | "WALLET_PASSPHRASE" | "WALLET_CONFIG_PATH" | "LIVE_EXECUTION">;
  dryRun: boolean;
  createPublicClient?: (chain: ChainConfig) => PublicClient;
  createWalletClient?: (
    chain: ChainConfig,
    account: ReturnType<typeof privateKeyToAccount>,
  ) => WalletClient;
};

function resolveChain(chainId: number): Chain | undefined {
  return CHAIN_MAP[chainId];
}

function loadKeystore(path: string): Result<KeystoreFile, WalletError> {
  if (!existsSync(path)) {
    return err({ code: "KEYSTORE_NOT_FOUND", message: `Keystore not found: ${path}` });
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const parsed = keystoreFileSchema.safeParse(raw);
    if (!parsed.success) {
      return err({ code: "KEYSTORE_INVALID", message: parsed.error.message });
    }
    return ok(parsed.data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err({ code: "KEYSTORE_INVALID", message });
  }
}

function defaultPublicClient(chain: ChainConfig): PublicClient {
  const viemChain = resolveChain(chain.id);
  if (!viemChain) {
    throw new Error(`unsupported chain id: ${chain.id}`);
  }
  return createPublicClient({
    chain: viemChain,
    transport: http(chain.rpc_url),
  });
}

export function createWallet(deps: WalletDeps) {
  const configPath = deps.env.WALLET_CONFIG_PATH ?? "config/wallet.example.yaml";
  const configResult = loadWalletConfig(configPath);
  if (!configResult.ok) {
    throw new Error(configResult.error.message);
  }
  const config: WalletConfig = configResult.value;

  function getChain(chainId: number): Result<ChainConfig, WalletError> {
    const chain = config.chains.find((c) => c.id === chainId);
    if (!chain) {
      return err({ code: "CHAIN_NOT_FOUND", message: `chain ${chainId} not configured` });
    }
    return ok(chain);
  }

  function getAddress(): Result<`0x${string}`, WalletError> {
    const ks = loadKeystore(deps.env.WALLET_KEYSTORE_PATH);
    if (!ks.ok) return ks;
    return ok(ks.value.address as `0x${string}`);
  }

  async function readBalances(
    chainId?: number,
  ): Promise<Result<BalanceEntry[], WalletError>> {
    const addressResult = getAddress();
    if (!addressResult.ok) return addressResult;
    const address = addressResult.value;

    const chains = chainId
      ? config.chains.filter((c) => c.id === chainId)
      : config.chains;

    if (chains.length === 0) {
      return err({ code: "CHAIN_NOT_FOUND", message: `chain ${chainId} not configured` });
    }

    const balances: BalanceEntry[] = [];

    for (const chain of chains) {
      const chainResult = await logExternalCall(
        "wallet",
        "readBalances",
        { chainId: chain.id, address },
        async () => {
          const client = deps.createPublicClient?.(chain) ?? defaultPublicClient(chain);
          const nativeBalance = await client.getBalance({ address });
          const entries: BalanceEntry[] = [
            {
              chainId: chain.id,
              chainName: chain.name,
              symbol: chain.native_symbol,
              address: "native",
              balance: nativeBalance,
              decimals: 18,
              formatted: formatUnits(nativeBalance, 18),
            },
          ];

          for (const token of chain.tokens) {
            const tokenBalance = (await client.readContract({
              address: token.address as `0x${string}`,
              abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf",
              args: [address],
            })) as bigint;
            entries.push({
              chainId: chain.id,
              chainName: chain.name,
              symbol: token.symbol,
              address: token.address as `0x${string}`,
              balance: tokenBalance,
              decimals: token.decimals,
              formatted: formatUnits(tokenBalance, token.decimals),
            });
          }
          return entries;
        },
      );
      balances.push(...chainResult);
    }

    return ok(balances);
  }

  async function sendTransaction(
    params: SendParams,
  ): Promise<Result<SendResult, WalletError>> {
    const chainResult = getChain(params.chainId);
    if (!chainResult.ok) return chainResult;

    if (deps.dryRun || !isLiveExecutionAllowed(deps.dryRun, deps.env)) {
      const simulatedHash = `0x${"ab".repeat(32)}` as `0x${string}`;
      await logExternalCall(
        "wallet",
        "sendTransaction",
        { ...params, dryRun: true, simulated: true },
        async () => ({ hash: simulatedHash, simulated: true }),
      );
      return ok({ hash: simulatedHash, simulated: true });
    }

    if (!deps.env.WALLET_PASSPHRASE) {
      return err({ code: "PASSPHRASE_MISSING", message: "WALLET_PASSPHRASE required for live send" });
    }

    const ks = loadKeystore(deps.env.WALLET_KEYSTORE_PATH);
    if (!ks.ok) return ks;

    const keyHolder = { value: "" };
    const decryptResult = decryptPrivateKey(ks.value, deps.env.WALLET_PASSPHRASE);
    if (!decryptResult.ok) return decryptResult;
    keyHolder.value = decryptResult.value;

    try {
      const account = privateKeyToAccount(keyHolder.value as `0x${string}`);
      const chain = chainResult.value;
      const viemChain = resolveChain(chain.id);
      if (!viemChain) {
        return err({ code: "CHAIN_NOT_FOUND", message: `unsupported chain ${chain.id}` });
      }

      const result = await logExternalCall(
        "wallet",
        "sendTransaction",
        { chainId: params.chainId, to: params.to, value: params.value.toString(), live: true },
        async () => {
          const client: WalletClient =
            deps.createWalletClient?.(chain, account) ??
            createWalletClient({
              account,
              chain: viemChain,
              transport: http(chain.rpc_url),
            });
          const hash = await client.sendTransaction({
            account,
            chain: viemChain,
            to: params.to,
            value: params.value,
            data: params.data,
          });
          return { hash, simulated: false };
        },
      );

      return ok(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err({ code: "RPC_ERROR", message });
    } finally {
      scrubHexKey(keyHolder);
    }
  }

  return {
    getAddress,
    readBalances,
    sendTransaction,
    config,
  };
}

export type Wallet = ReturnType<typeof createWallet>;
