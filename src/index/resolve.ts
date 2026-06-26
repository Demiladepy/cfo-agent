import type { Env } from "../config/env.js";
import { createMockIndexMcp } from "./client.js";
import { createIndexMcpTransport } from "./mcp.js";
import type { IndexMcpTools } from "./types.js";

export function resolveIndexMcp(env: Pick<Env, "INDEX_MCP_URL" | "INDEX_MCP_API_KEY">): {
  mcp: IndexMcpTools;
  mode: "live" | "mock";
} {
  const url = env.INDEX_MCP_URL;
  const apiKey = env.INDEX_MCP_API_KEY;
  if (url && apiKey) {
    return {
      mcp: createIndexMcpTransport({ url, apiKey }),
      mode: "live",
    };
  }
  return { mcp: createMockIndexMcp(), mode: "mock" };
}
