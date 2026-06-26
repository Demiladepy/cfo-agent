import type { LifiConfig, RouteQuote } from "./types.js";

export type SanityResult =
  | { ok: true }
  | { ok: false; reason: string };

export function checkRouteSanity(
  route: RouteQuote,
  config: LifiConfig,
  notionalUsd: number,
): SanityResult {
  const now = Date.now();
  const ageSeconds = (now - route.createdAt) / 1000;
  if (ageSeconds > config.route_max_age_seconds) {
    return {
      ok: false,
      reason: `route stale: ${ageSeconds.toFixed(0)}s > ${config.route_max_age_seconds}s`,
    };
  }

  if (route.slippageBps > config.max_slippage_bps) {
    return {
      ok: false,
      reason: `slippage ${route.slippageBps}bps > max ${config.max_slippage_bps}bps`,
    };
  }

  if (route.hops > config.max_hops) {
    return {
      ok: false,
      reason: `hops ${route.hops} > max ${config.max_hops}`,
    };
  }

  const totalFees = route.feeCostUsd + route.gasCostUsd;
  const feePercent = notionalUsd > 0 ? (totalFees / notionalUsd) * 100 : 100;
  if (feePercent > config.max_fee_percent) {
    return {
      ok: false,
      reason: `fees ${feePercent.toFixed(2)}% > max ${config.max_fee_percent}%`,
    };
  }

  return { ok: true };
}
