export const TRIGGERS_COMPONENT = "triggers" as const;

export { runRebalanceCheck, startTriggerScheduler } from "./scheduler.js";
export type { RebalanceCheckDeps, TriggerSchedulerDeps } from "./scheduler.js";

export function triggersPlaceholder(): typeof TRIGGERS_COMPONENT {
  return TRIGGERS_COMPONENT;
}
