import { err, ok, type Result } from "../lib/result.js";
import {
  policyActionSchema,
  type PolicyAction,
  type PolicyConfig,
  type PolicyDecision,
  type PolicyEngineDeps,
  type PolicyError,
  type PolicyEvaluation,
  type PolicyUsageContext,
} from "./types.js";

function checkAllowlist(
  config: PolicyConfig,
  action: PolicyAction,
): PolicyEvaluation | null {
  const { allowlist } = config;

  if (action.cryptoAddress !== undefined) {
    const normalized = action.cryptoAddress.toLowerCase();
    const allowed = allowlist.crypto_addresses.some(
      (a) => a.toLowerCase() === normalized,
    );
    if (!allowed) {
      return {
        decision: "deny",
        reason: `crypto address not on allowlist: ${action.cryptoAddress}`,
      };
    }
  }

  const category = action.recipientCategory ?? action.category;
  if (
    category !== undefined &&
    (action.kind === "spend" || action.kind === "transfer")
  ) {
    if (allowlist.index_recipient_categories.length === 0) {
      return {
        decision: "deny",
        reason: "index recipient category allowlist is empty",
      };
    }
    if (!allowlist.index_recipient_categories.includes(category)) {
      return {
        decision: "deny",
        reason: `recipient category not on allowlist: ${category}`,
      };
    }
  }

  return null;
}

function checkPerTxCap(
  config: PolicyConfig,
  action: PolicyAction,
): PolicyEvaluation | null {
  if (action.notionalNgn > config.per_tx_cap_ngn) {
    return {
      decision: "deny",
      reason: `per-tx cap exceeded: ${action.notionalNgn} > ${config.per_tx_cap_ngn} NGN`,
    };
  }
  return null;
}

function checkCategoryCap(
  config: PolicyConfig,
  action: PolicyAction,
  usage: PolicyUsageContext,
): PolicyEvaluation | null {
  const category = action.category;
  if (!category || !config.category_caps?.[category]) {
    return null;
  }

  const cap = config.category_caps[category].daily_ngn;
  const spent = usage.sumDailyNgn(category);
  if (spent + action.notionalNgn > cap) {
    return {
      decision: "deny",
      reason: `category daily cap exceeded for ${category}: ${spent + action.notionalNgn} > ${cap} NGN`,
    };
  }
  return null;
}

function checkDailyCap(
  config: PolicyConfig,
  action: PolicyAction,
  usage: PolicyUsageContext,
): PolicyEvaluation | null {
  const spent = usage.sumDailyNgn();
  if (spent + action.notionalNgn > config.daily_cap_ngn) {
    return {
      decision: "deny",
      reason: `daily cap exceeded: ${spent + action.notionalNgn} > ${config.daily_cap_ngn} NGN`,
    };
  }
  return null;
}

function checkWeeklyCap(
  config: PolicyConfig,
  action: PolicyAction,
  usage: PolicyUsageContext,
): PolicyEvaluation | null {
  const spent = usage.sumWeeklyNgn();
  if (spent + action.notionalNgn > config.weekly_cap_ngn) {
    return {
      decision: "deny",
      reason: `weekly cap exceeded: ${spent + action.notionalNgn} > ${config.weekly_cap_ngn} NGN`,
    };
  }
  return null;
}

function checkVelocity(
  config: PolicyConfig,
  usage: PolicyUsageContext,
): PolicyEvaluation | null {
  const recent = usage.countRecentActions(config.velocity.window_seconds);
  if (recent >= config.velocity.max_actions) {
    return {
      decision: "deny",
      reason: `velocity limit exceeded: ${recent} actions in ${config.velocity.window_seconds}s (max ${config.velocity.max_actions})`,
    };
  }
  return null;
}

function checkConfirmThreshold(
  config: PolicyConfig,
  action: PolicyAction,
): PolicyEvaluation | null {
  if (action.notionalNgn >= config.confirm_threshold_ngn) {
    return {
      decision: "confirm",
      reason: `amount ${action.notionalNgn} NGN meets confirm threshold ${config.confirm_threshold_ngn}`,
    };
  }
  return null;
}

export function evaluateRules(
  config: PolicyConfig,
  action: PolicyAction,
  usage: PolicyUsageContext,
  isKillSwitchActive: boolean,
): PolicyEvaluation {
  if (isKillSwitchActive) {
    return { decision: "deny", reason: "kill switch is active" };
  }

  const rules: Array<PolicyEvaluation | null> = [
    checkAllowlist(config, action),
    checkPerTxCap(config, action),
    checkCategoryCap(config, action, usage),
    checkDailyCap(config, action, usage),
    checkWeeklyCap(config, action, usage),
    checkVelocity(config, usage),
  ];

  for (const result of rules) {
    if (result !== null) {
      return result;
    }
  }

  const confirm = checkConfirmThreshold(config, action);
  if (confirm !== null) {
    return confirm;
  }

  return { decision: "allow", reason: "within policy limits" };
}

export function createPolicyEngine(deps: PolicyEngineDeps) {
  return {
    evaluate(
      input: unknown,
    ): Result<PolicyEvaluation, PolicyError> {
      const parsed = policyActionSchema.safeParse(input);
      if (!parsed.success) {
        return err({
          code: "INVALID_ACTION",
          message: parsed.error.message,
        });
      }

      const action = parsed.data;
      const evaluation = evaluateRules(
        deps.config,
        action,
        deps.usage,
        deps.isKillSwitchActive(),
      );

      deps.onAudit({
        action,
        decision: evaluation.decision,
        reason: evaluation.reason,
      });

      return ok(evaluation);
    },
  };
}

export type PolicyEngine = ReturnType<typeof createPolicyEngine>;
