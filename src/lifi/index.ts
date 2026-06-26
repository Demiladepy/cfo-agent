export const LIFI_COMPONENT = "lifi" as const;

export { loadLifiConfig, DEFAULT_LIFI_CONFIG_PATH } from "./config.js";
export { checkRouteSanity } from "./sanity.js";
export { createLifiClient } from "./client.js";
export { createLifiSdk, resetLifiSdkForTests } from "./sdk.js";
export { resolveLifiSdk } from "./resolve.js";
export type { LifiClient, LifiSdk, LifiClientDeps } from "./client.js";
export type {
  ExecuteResult,
  LifiConfig,
  LifiError,
  QuoteRequest,
  RouteQuote,
} from "./types.js";
export { lifiConfigSchema, quoteRequestSchema } from "./types.js";

export function lifiPlaceholder(): typeof LIFI_COMPONENT {
  return LIFI_COMPONENT;
}
