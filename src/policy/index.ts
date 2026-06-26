import type { MemoryStore } from "../memory/index.js";
import { appendAuditLog } from "../memory/index.js";
import { err, isOk, type Result } from "../lib/result.js";
import { loadPolicyFile } from "./config.js";
import { createPolicyEngine, type PolicyEngine } from "./engine.js";
import { isKillSwitchActive } from "./kill-switch.js";
import type {
  PolicyConfig,
  PolicyError,
  PolicyEvaluation,
  PolicyUsageContext,
} from "./types.js";
import { createUsageContextFromStore } from "./usage.js";

export const POLICY_COMPONENT = "policy" as const;

export {
  activateKillSwitch,
  deactivateKillSwitch,
  getKillSwitchPath,
  isKillSwitchActive,
} from "./kill-switch.js";
export {
  DEFAULT_POLICY_PATH,
  EXAMPLE_POLICY_PATH,
  loadPolicyFile,
  loadPolicyFromObject,
  resolvePolicyPath,
} from "./config.js";
export { createPolicyEngine, evaluateRules, type PolicyEngine } from "./engine.js";
export { createUsageContextFromStore } from "./usage.js";
export type {
  PolicyAction,
  PolicyConfig,
  PolicyDecision,
  PolicyEvaluation,
  PolicyError,
  PolicyUsageContext,
} from "./types.js";
export {
  policyActionSchema,
  policyConfigSchema,
  policyDecisionSchema,
} from "./types.js";

export type CreatePolicyEngineOptions = {
  config: PolicyConfig;
  store?: MemoryStore;
  usage?: PolicyUsageContext;
  isKillSwitchActive?: () => boolean;
};

export function createPolicyEngineWithAudit(
  options: CreatePolicyEngineOptions,
): PolicyEngine {
  const usage =
    options.usage ??
    (options.store ? createUsageContextFromStore(options.store) : zeroUsage());

  return createPolicyEngine({
    config: options.config,
    isKillSwitchActive: options.isKillSwitchActive ?? isKillSwitchActive,
    usage,
    onAudit(entry) {
      if (!options.store) return;
      appendAuditLog(options.store, {
        action: entry.action.kind,
        decision: entry.decision,
        reason: entry.reason,
        metadata: { action: entry.action },
      });
    },
  });
}

function zeroUsage(): PolicyUsageContext {
  return {
    countRecentActions: () => 0,
    sumDailyNgn: () => 0,
    sumWeeklyNgn: () => 0,
  };
}

export function evaluate(
  engine: PolicyEngine,
  action: unknown,
): Result<PolicyEvaluation, PolicyError> {
  return engine.evaluate(action);
}

export function loadAndCreatePolicyEngine(
  store: MemoryStore,
  policyPath?: string,
): Result<PolicyEngine, { code: string; message: string }> {
  const path = policyPath ?? "config/policy.example.yaml";
  const loaded = loadPolicyFile(path);
  if (!isOk(loaded)) {
    return err(loaded.error);
  }
  return {
    ok: true,
    value: createPolicyEngineWithAudit({
      config: loaded.value,
      store,
    }),
  };
}

/** @deprecated Use createPolicyEngineWithAudit — kept for boot component list */
export function policyPlaceholder(): typeof POLICY_COMPONENT {
  return POLICY_COMPONENT;
}
