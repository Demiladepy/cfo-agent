import { z } from "zod";

export const envSchema = z.object({
  DATABASE_PATH: z.string().default("./data/agent.db"),
  POLICY_PATH: z.string().optional(),
  KILL_SWITCH_PATH: z.string().optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LIVE_EXECUTION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  WALLET_KEYSTORE_PATH: z.string().default("./data/keystore.json"),
  WALLET_PASSPHRASE: z.string().optional(),
  WALLET_CONFIG_PATH: z.string().optional(),
  LIFI_CONFIG_PATH: z.string().optional(),
  LIFI_INTEGRATOR: z.string().optional(),
  INDEX_MCP_URL: z.string().optional(),
  INDEX_MCP_API_KEY: z.string().optional(),
  INDEX_MCP_BALANCE_TOOL: z.string().optional(),
  INDEX_MCP_AIRTIME_TOOL: z.string().optional(),
  INDEX_MCP_TRANSFER_TOOL: z.string().optional(),
  FX_FALLBACK_USD_NGN: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : undefined)),
  OFFRAMP_PROVIDER: z.string().default("juicyway"),
  JUICYWAY_API_KEY: z.string().optional(),
  JUICYWAY_BASE_URL: z.string().optional(),
  JUICYWAY_BENEFICIARY_ID: z.string().optional(),
  JUICYWAY_PAYOUT_PIN: z.string().optional(),
  YELLOWCARD_API_KEY: z.string().optional(),
  YELLOWCARD_SECRET_KEY: z.string().optional(),
  ONRAMP_API_KEY: z.string().optional(),
  ONRAMP_APP_ID: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),
  REBALANCE_TARGET_NGN: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : undefined)),
  REBALANCE_CRON: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;
  cachedEnv = envSchema.parse(process.env);
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}
