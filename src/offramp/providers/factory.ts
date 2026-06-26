import type { Env } from "../../config/env.js";
import { createMockOfframpProvider, type OfframpProvider } from "../client.js";
import { createJuicywayProvider } from "./juicyway.js";

export const JUICYWAY_SANDBOX_URL = "https://api-sandbox.spendjuice.com";
export const JUICYWAY_PRODUCTION_URL = "https://api.spendjuice.com";

export type ResolveOfframpProviderOptions = {
  env: Pick<
    Env,
    | "OFFRAMP_PROVIDER"
    | "JUICYWAY_API_KEY"
    | "JUICYWAY_BASE_URL"
    | "JUICYWAY_BENEFICIARY_ID"
    | "JUICYWAY_PAYOUT_PIN"
    | "YELLOWCARD_API_KEY"
    | "YELLOWCARD_SECRET_KEY"
  >;
  /** When true, always return mock even if keys are set */
  forceMock?: boolean;
};

export function resolveOfframpProvider(
  options: ResolveOfframpProviderOptions,
): OfframpProvider {
  if (options.forceMock) {
    return createMockOfframpProvider("mock");
  }

  const provider = (options.env.OFFRAMP_PROVIDER ?? "juicyway").toLowerCase();

  if (provider === "juicyway") {
    if (!options.env.JUICYWAY_API_KEY || !options.env.JUICYWAY_BENEFICIARY_ID) {
      return createMockOfframpProvider("juicyway-mock");
    }
    return createJuicywayProvider({
      apiKey: options.env.JUICYWAY_API_KEY,
      baseUrl: options.env.JUICYWAY_BASE_URL ?? JUICYWAY_SANDBOX_URL,
      beneficiaryId: options.env.JUICYWAY_BENEFICIARY_ID,
      payoutPin: options.env.JUICYWAY_PAYOUT_PIN,
    });
  }

  if (provider === "yellowcard") {
    if (!options.env.YELLOWCARD_API_KEY) {
      return createMockOfframpProvider("yellowcard-mock");
    }
    throw new Error(
      "Yellow Card provider unavailable — engineering docs down. Use OFFRAMP_PROVIDER=juicyway or onramp.",
    );
  }

  if (provider === "onramp") {
    throw new Error(
      "Onramp.money provider not wired yet. Set OFFRAMP_PROVIDER=juicyway for now.",
    );
  }

  throw new Error(`Unknown OFFRAMP_PROVIDER: ${provider}`);
}
