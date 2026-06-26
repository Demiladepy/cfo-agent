import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { formatEther, type PublicClient } from "viem";
import {
  createWallet,
  decryptPrivateKey,
  encryptPrivateKey,
  loadWalletConfig,
} from "../index.js";
import { isOk } from "../../lib/result.js";

const TEST_PRIVATE_KEY = generatePrivateKey();
const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVATE_KEY);

describe("keystore", () => {
  it("round-trips encrypt and decrypt", () => {
    const keystore = encryptPrivateKey(
      TEST_PRIVATE_KEY,
      "test-passphrase",
      TEST_ACCOUNT.address,
    );
    const result = decryptPrivateKey(keystore, "test-passphrase");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.toLowerCase()).toBe(TEST_PRIVATE_KEY.toLowerCase());
    }
  });

  it("fails decrypt with wrong passphrase", () => {
    const keystore = encryptPrivateKey(
      TEST_PRIVATE_KEY,
      "correct",
      TEST_ACCOUNT.address,
    );
    const result = decryptPrivateKey(keystore, "wrong");
    expect(result.ok).toBe(false);
  });
});

describe("wallet config", () => {
  it("loads example wallet config", () => {
    const result = loadWalletConfig("config/wallet.example.yaml");
    expect(isOk(result)).toBe(true);
  });
});

describe("wallet read balances", () => {
  it("returns mocked native and token balances", async () => {
    const wallet = createWallet({
      env: {
        WALLET_KEYSTORE_PATH: createTestKeystore(),
        WALLET_PASSPHRASE: "test",
        WALLET_CONFIG_PATH: "config/wallet.example.yaml",
        LIVE_EXECUTION: false,
      },
      dryRun: true,
      createPublicClient: () =>
        ({
          async getBalance() {
            return 1_000_000_000_000_000_000n;
          },
          async readContract() {
            return 5_000_000n;
          },
        }) as unknown as PublicClient,
    });

    const result = await wallet.readBalances(11155111);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value[0]?.formatted).toBe(formatEther(1_000_000_000_000_000_000n));
      expect(result.value.some((b) => b.symbol === "USDC")).toBe(true);
    }
  });
});

describe("wallet sendTransaction", () => {
  it("returns simulated hash in dry-run mode", async () => {
    const wallet = createWallet({
      env: {
        WALLET_KEYSTORE_PATH: createTestKeystore(),
        WALLET_PASSPHRASE: "test",
        WALLET_CONFIG_PATH: "config/wallet.example.yaml",
        LIVE_EXECUTION: false,
      },
      dryRun: true,
    });

    const result = await wallet.sendTransaction({
      chainId: 11155111,
      to: "0x0000000000000000000000000000000000000002",
      value: 1n,
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.simulated).toBe(true);
      expect(result.value.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    }
  });

  it("blocks live send without LIVE_EXECUTION env", async () => {
    const wallet = createWallet({
      env: {
        WALLET_KEYSTORE_PATH: createTestKeystore(),
        WALLET_PASSPHRASE: "test",
        WALLET_CONFIG_PATH: "config/wallet.example.yaml",
        LIVE_EXECUTION: false,
      },
      dryRun: false,
    });

    const result = await wallet.sendTransaction({
      chainId: 11155111,
      to: "0x0000000000000000000000000000000000000002",
      value: 1n,
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.simulated).toBe(true);
    }
  });
});

describe("private key log safety", () => {
  let logOutput: string;

  beforeEach(() => {
    logOutput = "";
    const original = console.log;
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logOutput += args.map(String).join(" ");
      original(...args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not leak private key hex into captured output during wallet ops", async () => {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    const dir = mkdtempSync(join(tmpdir(), "cfo-wallet-log-"));
    const keystorePath = join(dir, "keystore.json");
    writeFileSync(
      keystorePath,
      JSON.stringify(encryptPrivateKey(key, "test-pass", account.address)),
    );

    const wallet = createWallet({
      env: {
        WALLET_KEYSTORE_PATH: keystorePath,
        WALLET_PASSPHRASE: "test-pass",
        WALLET_CONFIG_PATH: "config/wallet.example.yaml",
        LIVE_EXECUTION: false,
      },
      dryRun: true,
      createPublicClient: () =>
        ({
          async getBalance() {
            return 0n;
          },
          async readContract() {
            return 0n;
          },
        }) as unknown as PublicClient,
    });

    await wallet.readBalances(11155111);
    await wallet.sendTransaction({
      chainId: 11155111,
      to: "0x0000000000000000000000000000000000000002",
      value: 1n,
    });

    const keyBody = key.replace(/^0x/, "");
    expect(logOutput).not.toContain(keyBody);
    expect(logOutput).not.toContain(key);

    rmSync(dir, { recursive: true, force: true });
  });
});

function createTestKeystore(): string {
  const dir = mkdtempSync(join(tmpdir(), "cfo-ks-"));
  const path = join(dir, "keystore.json");
  writeFileSync(
    path,
    JSON.stringify(
      encryptPrivateKey(TEST_PRIVATE_KEY, "test", TEST_ACCOUNT.address),
    ),
  );
  return path;
}
