export const OFFRAMP_COMPONENT = "offramp" as const;

export {
  createOfframpClient,
  createMockOfframpProvider,
} from "./client.js";
export {
  resolveOfframpProvider,
  JUICYWAY_SANDBOX_URL,
  JUICYWAY_PRODUCTION_URL,
} from "./providers/factory.js";
export { createJuicywayProvider } from "./providers/juicyway.js";
export type {
  OfframpClientDeps,
  OfframpProvider,
  OfframpRequest,
  OfframpResult,
} from "./client.js";

export function offrampPlaceholder(): typeof OFFRAMP_COMPONENT {
  return OFFRAMP_COMPONENT;
}
