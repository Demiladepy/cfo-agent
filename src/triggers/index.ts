export const TRIGGERS_COMPONENT = "triggers" as const;

export { runRebalanceCheck, startTriggerScheduler } from "./scheduler.js";
export type { RebalanceCheckDeps, TriggerSchedulerDeps } from "./scheduler.js";
export {
  createTriggerManager,
  REBALANCE_JOB_ID,
  REFLECTION_JOB_ID,
  BOOT_DRY_RUN_LOG,
  type TriggerManager,
} from "./manager.js";
export { executeRebalanceTopup, type RebalanceFlowResult } from "./rebalance-flow.js";
export {
  isTriggerJobPaused,
  pauseTriggerJob,
  resumeTriggerJob,
} from "./pause.js";
export { mergeTriggerJobStates, type TriggerJobState } from "./state.js";

export function triggersPlaceholder(): typeof TRIGGERS_COMPONENT {
  return TRIGGERS_COMPONENT;
}
