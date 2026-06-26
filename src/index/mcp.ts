import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  AirtimeRequest,
  IndexMcpTools,
  IndexToolResult,
  TransferRequest,
} from "./types.js";

export type IndexMcpConfig = {
  url: string;
  apiKey: string;
  airtimeToolName?: string;
  transferToolName?: string;
};

type McpContent = { type: string; text?: string };

function parseToolPayload(result: {
  content?: McpContent[];
  structuredContent?: unknown;
  isError?: boolean;
}): IndexToolResult<{ reference: string }> {
  if (result.isError) {
    const text = result.content?.map((c) => c.text ?? "").join(" ") ?? "MCP error";
    return { success: false, error: text };
  }

  if (result.structuredContent && typeof result.structuredContent === "object") {
    const data = result.structuredContent as Record<string, unknown>;
    const reference =
      (data["reference"] as string | undefined) ??
      (data["id"] as string | undefined) ??
      (data["transaction_id"] as string | undefined);
    if (reference) {
      return { success: true, reference, data: { reference } };
    }
  }

  const text = result.content?.find((c) => c.type === "text")?.text;
  if (text) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const reference =
        (json["reference"] as string | undefined) ??
        (json["id"] as string | undefined) ??
        (json["transaction_id"] as string | undefined);
      if (reference) {
        return { success: true, reference, data: { reference } };
      }
    } catch {
      if (text.length > 0) {
        return { success: true, reference: text.slice(0, 64), data: { reference: text.slice(0, 64) } };
      }
    }
  }

  return { success: false, error: "could not parse MCP tool response" };
}

function pickToolName(
  tools: Array<{ name: string }>,
  explicit: string | undefined,
  keywords: string[],
): string | undefined {
  if (explicit) return explicit;
  const lower = (n: string) => n.toLowerCase();
  return tools.find((t) => keywords.some((k) => lower(t.name).includes(k)))?.name;
}

function toSnakeArgs(req: AirtimeRequest | TransferRequest): Record<string, unknown> {
  if ("phone" in req) {
    return {
      phone: req.phone,
      amount_ngn: req.amountNgn,
      amountNgn: req.amountNgn,
      network: req.network,
      idempotency_key: req.idempotencyKey,
      idempotencyKey: req.idempotencyKey,
    };
  }
  return {
    recipient_id: req.recipientId,
    recipientId: req.recipientId,
    recipient_category: req.recipientCategory,
    recipientCategory: req.recipientCategory,
    amount_ngn: req.amountNgn,
    amountNgn: req.amountNgn,
    idempotency_key: req.idempotencyKey,
    idempotencyKey: req.idempotencyKey,
  };
}

export async function createIndexMcpClient(
  config: IndexMcpConfig,
): Promise<IndexMcpTools & { close: () => Promise<void> }> {
  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: {
      headers: {
        Authorization: config.apiKey.startsWith("Bearer ")
          ? config.apiKey
          : `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
    },
  });

  const client = new Client(
    { name: "personal-cfo-agent", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);

  const listed = await client.listTools();
  const airtimeTool = pickToolName(listed.tools, config.airtimeToolName, [
    "airtime",
    "purchase_airtime",
  ]);
  const transferTool = pickToolName(listed.tools, config.transferToolName, [
    "transfer",
    "send",
    "payout",
  ]);

  async function callTool(
    toolName: string | undefined,
    req: AirtimeRequest | TransferRequest,
  ): Promise<IndexToolResult<{ reference: string }>> {
    if (!toolName) {
      return {
        success: false,
        error: `MCP tool not found. Available: ${listed.tools.map((t) => t.name).join(", ")}`,
      };
    }
    const result = await client.callTool({
      name: toolName,
      arguments: toSnakeArgs(req),
    });
    return parseToolPayload(result as Parameters<typeof parseToolPayload>[0]);
  }

  return {
    async purchaseAirtime(req) {
      return callTool(airtimeTool, req);
    },
    async transfer(req) {
      return callTool(transferTool, req);
    },
    async close() {
      await transport.close();
    },
  };
}

/** Stateless MCP call — connects per request (simpler for demo server). */
export function createIndexMcpTransport(config: IndexMcpConfig): IndexMcpTools {
  return {
    async purchaseAirtime(req) {
      const client = await createIndexMcpClient(config);
      try {
        return await client.purchaseAirtime(req);
      } finally {
        await client.close();
      }
    },
    async transfer(req) {
      const client = await createIndexMcpClient(config);
      try {
        return await client.transfer(req);
      } finally {
        await client.close();
      }
    },
  };
}
