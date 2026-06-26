export const WALLET_COMPONENT = "wallet" as const;
export { walletPlaceholder } from "./component.js";
export { loadWalletConfig, DEFAULT_WALLET_CONFIG_PATH } from "./config.js";
export { createWallet } from "./wallet.js";
export type { Wallet, WalletDeps } from "./wallet.js";
export type {
  BalanceEntry,
  ChainConfig,
  KeystoreFile,
  SendParams,
  SendResult,
  TokenConfig,
  WalletConfig,
  WalletError,
} from "./types.js";
export { encryptPrivateKey, decryptPrivateKey, scrubHexKey } from "./keystore.js";
