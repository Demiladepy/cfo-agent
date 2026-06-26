export const INDEX_COMPONENT = "index" as const;

export { createIndexClient, createMockIndexMcp } from "./client.js";
export { createIndexMcpTransport, createIndexMcpClient } from "./mcp.js";
export { resolveIndexMcp } from "./resolve.js";
export type { IndexClient, IndexClientDeps } from "./client.js";
export {
  hasIdempotencyKey,
  recordIdempotencyKey,
  getIdempotencyReference,
} from "./idempotency.js";
export type {
  AirtimeRequest,
  TransferRequest,
  IndexError,
  IndexMcpTools,
} from "./types.js";
export { airtimeRequestSchema, transferRequestSchema } from "./types.js";

export function indexPlaceholder(): typeof INDEX_COMPONENT {
  return INDEX_COMPONENT;
}
