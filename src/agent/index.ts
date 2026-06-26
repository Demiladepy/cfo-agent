export const AGENT_COMPONENT = "agent" as const;

export { SYSTEM_PROMPT, detectInjectionInToolResult } from "./prompt.js";
export {
  executeSendNgnFlow,
  processToolResult,
  type AgentTools,
  type AgentAction,
  type SendNgnIntent,
} from "./runner.js";
export { runClaudeAgent, type ClaudeAgentDeps, type ClaudeAgentResult } from "./claude.js";

export function agentPlaceholder(): typeof AGENT_COMPONENT {
  return AGENT_COMPONENT;
}
