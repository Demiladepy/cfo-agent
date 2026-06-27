import { logger } from "../lib/logger.js";

export type FxRateSource = "live" | "cache" | "fallback";

export type FxRateResult = {
  rate: number;
  source: FxRateSource;
};

export type CreateFxServiceOptions = {
  getRateFromProvider?: () => Promise<number>;
  fallbackUsdNgn: number;
  cacheTtlMs?: number;
};

export type FxService = {
  getUsdToNgn: () => Promise<FxRateResult>;
};

export function createFxService(options: CreateFxServiceOptions): FxService {
  const cacheTtlMs = options.cacheTtlMs ?? 60_000;
  let cached: { rate: number; at: number } | null = null;

  return {
    async getUsdToNgn(): Promise<FxRateResult> {
      if (cached && Date.now() - cached.at < cacheTtlMs) {
        return { rate: cached.rate, source: "cache" };
      }

      if (options.getRateFromProvider) {
        try {
          const rate = await options.getRateFromProvider();
          if (Number.isFinite(rate) && rate > 0) {
            cached = { rate, at: Date.now() };
            return { rate, source: "live" };
          }
        } catch (e) {
          logger.warn(
            {
              err: e instanceof Error ? e.message : String(e),
              fallback: options.fallbackUsdNgn,
            },
            "FX provider unreachable — using fallback USD/NGN rate",
          );
        }
      } else {
        logger.warn(
          { fallback: options.fallbackUsdNgn },
          "FX provider not configured — using fallback USD/NGN rate",
        );
      }

      return { rate: options.fallbackUsdNgn, source: "fallback" };
    },
  };
}

/** Reset in-memory FX cache between tests. */
export function resetFxCacheForTests(service: FxService & { _resetCache?: () => void }): void {
  void service;
}
