import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { logExternalCall } from "../lib/logger.js";
import { isOk } from "../lib/result.js";
import { SYSTEM_PROMPT, detectInjectionInToolResult } from "./prompt.js";
import {
  executeSendNgnFlow,
  type AgentAction,
  type AgentTools,
  type SendNgnIntent,
} from "./runner.js";

export type ClaudeAgentDeps = {
  tools: AgentTools;
  dryRun: boolean;
  apiKey: string;
  model?: string;
  client?: Anthropic;
  maxTurns?: number;
};

export type ClaudeAgentResult = {
  reply: string;
  actions: AgentAction[];
};

const AGENT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "send_ngn",
    description:
      "Send NGN to a recipient. Routes from USDC via LI.FI if ngnBalanceNgn is insufficient.",
    input_schema: {
      type: "object",
      properties: {
        amountNgn: { type: "number", description: "Amount in NGN kobo units (naira)" },
        recipientId: { type: "string" },
        recipientCategory: { type: "string", description: "e.g. family, food, airtime" },
        ngnBalanceNgn: { type: "number", description: "Optional fallback NGN float if Index balance MCP unavailable" },
      },
      required: ["amountNgn", "recipientId", "recipientCategory"],
    },
  },
  {
    name: "purchase_airtime",
    description: "Buy mobile airtime via Paystack Index",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string" },
        amountNgn: { type: "number" },
        network: { type: "string", enum: ["mtn", "glo", "airtel", "9mobile"] },
      },
      required: ["phone", "amountNgn", "network"],
    },
  },
  {
    name: "read_wallet_balances",
    description: "Read EVM wallet balances (native + tokens)",
    input_schema: { type: "object", properties: {} },
  },
];

export async function runClaudeAgent(
  deps: ClaudeAgentDeps,
  userMessage: string,
): Promise<ClaudeAgentResult> {
  const client = deps.client ?? new Anthropic({ apiKey: deps.apiKey });
  const model = deps.model ?? "claude-sonnet-4-20250514";
  const maxTurns = deps.maxTurns ?? 6;
  const actions: AgentAction[] = [];

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  return logExternalCall("agent", "claude.run", { userMessage }, async () => {
    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: AGENT_TOOLS,
        messages,
      });

      const toolUses = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
      );
      const textBlocks = response.content.filter(
        (b): b is Anthropic.Messages.TextBlock => b.type === "text",
      );

      if (toolUses.length === 0) {
        return {
          reply: textBlocks.map((t) => t.text).join("\n") || "Done.",
          actions,
        };
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        const raw = await dispatchTool(deps, toolUse.name, toolUse.input, actions);
        if (detectInjectionInToolResult(raw)) {
          actions.push({
            type: "injection_detected",
            payload: `injection in ${toolUse.name}: ${raw.slice(0, 120)}`,
          });
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: raw,
        });
      }

      messages.push({ role: "user", content: toolResults });

      if (response.stop_reason === "end_turn" && toolUses.length === 0) {
        break;
      }
    }

    return { reply: "Agent reached max turns.", actions };
  });
}

async function dispatchTool(
  deps: ClaudeAgentDeps,
  name: string,
  input: unknown,
  actions: AgentAction[],
): Promise<string> {
  const args = input as Record<string, unknown>;

  if (name === "send_ngn") {
    const intent: SendNgnIntent = {
      amountNgn: Number(args["amountNgn"]),
      recipientId: String(args["recipientId"]),
      recipientCategory: String(args["recipientCategory"]),
      ...(args["ngnBalanceNgn"] !== undefined
        ? { ngnBalanceNgn: Number(args["ngnBalanceNgn"]) }
        : {}),
    };
    const flowActions = await executeSendNgnFlow(deps.tools, intent, deps.dryRun);
    actions.push(...flowActions);
    return JSON.stringify(flowActions);
  }

  if (name === "purchase_airtime") {
    const result = await deps.tools.index.purchaseAirtime({
      phone: String(args["phone"]),
      amountNgn: Number(args["amountNgn"]),
      network: args["network"] as "mtn" | "glo" | "airtel" | "9mobile",
      idempotencyKey: randomUUID(),
    });
    const payload = isOk(result) ? result.value : result.error;
    actions.push({
      type: isOk(result) ? "report" : "insufficient_funds",
      ...(isOk(result)
        ? { message: `airtime ok: ${result.value.reference}` }
        : { message: result.error.message }),
    });
    return JSON.stringify(payload);
  }

  if (name === "read_wallet_balances") {
    const balances = await deps.tools.wallet.readBalances();
    return JSON.stringify(isOk(balances) ? balances.value : balances.error);
  }

  return JSON.stringify({ error: `unknown tool: ${name}` });
}
