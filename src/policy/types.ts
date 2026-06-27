import { z } from "zod";

export const policyDecisionSchema = z.enum(["allow", "deny", "confirm"]);
export type PolicyDecision = z.infer<typeof policyDecisionSchema>;

export const policyActionSchema = z.object({
  kind: z.enum(["spend", "transfer", "swap", "bridge", "offramp"]),
  notionalNgn: z.number().positive(),
  category: z.string().optional(),
  recipientCategory: z.string().optional(),
  recipientId: z.string().optional(),
  cryptoAddress: z.string().optional(),
});
export type PolicyAction = z.infer<typeof policyActionSchema>;

export const policyEvaluationSchema = z.object({
  decision: policyDecisionSchema,
  reason: z.string(),
});
export type PolicyEvaluation = z.infer<typeof policyEvaluationSchema>;

export type PolicyErrorCode =
  | "INVALID_ACTION"
  | "KILL_SWITCH_ACTIVE"
  | "CONFIG_ERROR";

export type PolicyError = {
  code: PolicyErrorCode;
  message: string;
};

export const velocityConfigSchema = z.object({
  max_actions: z.number().int().positive(),
  window_seconds: z.number().int().positive(),
});

export const allowlistConfigSchema = z.object({
  crypto_addresses: z.array(z.string()),
  index_recipient_categories: z.array(z.string()),
});

export const categoryCapSchema = z.object({
  daily_ngn: z.number().positive(),
});

export const policyConfigSchema = z.object({
  per_tx_cap_ngn: z.number().positive(),
  daily_cap_ngn: z.number().positive(),
  weekly_cap_ngn: z.number().positive(),
  confirm_threshold_ngn: z.number().positive(),
  velocity: velocityConfigSchema,
  allowlist: allowlistConfigSchema,
  category_caps: z.record(categoryCapSchema).optional(),
});
export type PolicyConfig = z.infer<typeof policyConfigSchema>;

export type PolicyUsageContext = {
  countRecentActions: (windowSeconds: number) => number;
  sumDailyNgn: (category?: string) => number;
  sumWeeklyNgn: (category?: string) => number;
};

export type PolicyEngineDeps = {
  config: PolicyConfig;
  isKillSwitchActive: () => boolean;
  usage: PolicyUsageContext;
  onAudit: (entry: {
    action: PolicyAction;
    decision: PolicyDecision;
    reason: string;
  }) => void;
};
