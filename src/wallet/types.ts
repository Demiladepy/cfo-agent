import { z } from "zod";

export const tokenConfigSchema = z.object({
  symbol: z.string(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  decimals: z.number().int().nonnegative(),
});

export const chainConfigSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  rpc_url: z.string().url(),
  native_symbol: z.string(),
  tokens: z.array(tokenConfigSchema).default([]),
});

export const walletConfigSchema = z.object({
  chains: z.array(chainConfigSchema).min(1),
});

export type WalletConfig = z.infer<typeof walletConfigSchema>;
export type ChainConfig = z.infer<typeof chainConfigSchema>;
export type TokenConfig = z.infer<typeof tokenConfigSchema>;

export const keystoreFileSchema = z.object({
  version: z.literal(1),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  salt: z.string(),
  nonce: z.string(),
  ciphertext: z.string(),
});

export type KeystoreFile = z.infer<typeof keystoreFileSchema>;

export type WalletErrorCode =
  | "KEYSTORE_NOT_FOUND"
  | "KEYSTORE_INVALID"
  | "DECRYPT_FAILED"
  | "PASSPHRASE_MISSING"
  | "CHAIN_NOT_FOUND"
  | "DRY_RUN_ONLY"
  | "LIVE_NOT_ALLOWED"
  | "RPC_ERROR";

export type WalletError = {
  code: WalletErrorCode;
  message: string;
};

export type BalanceEntry = {
  chainId: number;
  chainName: string;
  symbol: string;
  address: `0x${string}` | "native";
  balance: bigint;
  decimals: number;
  formatted: string;
};

export type SendParams = {
  chainId: number;
  to: `0x${string}`;
  value: bigint;
  data?: `0x${string}`;
};

export type SendResult = {
  hash: `0x${string}`;
  simulated: boolean;
};
