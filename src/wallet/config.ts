import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { err, ok, type Result } from "../lib/result.js";
import { walletConfigSchema, type WalletConfig } from "./types.js";

export const DEFAULT_WALLET_CONFIG_PATH = "config/wallet.example.yaml";

export type LoadWalletConfigError = {
  code: "NOT_FOUND" | "PARSE_ERROR" | "VALIDATION_ERROR";
  message: string;
};

export function loadWalletConfig(
  path: string,
): Result<WalletConfig, LoadWalletConfigError> {
  if (!existsSync(path)) {
    return err({ code: "NOT_FOUND", message: `Wallet config not found: ${path}` });
  }

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, "utf8"));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err({ code: "PARSE_ERROR", message });
  }

  const parsed = walletConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return err({ code: "VALIDATION_ERROR", message: parsed.error.message });
  }
  return ok(parsed.data);
}
