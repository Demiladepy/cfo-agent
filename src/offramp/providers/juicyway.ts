import { logExternalCall } from "../../lib/logger.js";
import type { OfframpProvider, OfframpRequest } from "../client.js";

export type JuicywayConfig = {
  apiKey: string;
  baseUrl: string;
  beneficiaryId: string;
  payoutPin?: string;
  fetchFn?: typeof fetch;
};

type JuicywayResponse<T> = {
  data?: T;
  message?: string;
};

export function createJuicywayProvider(config: JuicywayConfig): OfframpProvider {
  const fetchFn = config.fetchFn ?? fetch;

  async function juicywayRequest<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
    const response = await fetchFn(url, {
      method,
      headers: {
        Authorization: config.apiKey,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await response.json()) as JuicywayResponse<T> & T;
    if (!response.ok) {
      const message =
        (json as JuicywayResponse<T>).message ??
        `Juicyway API error ${response.status}`;
      throw new Error(message);
    }
    return (json as JuicywayResponse<T>).data ?? (json as T);
  }

  return {
    name: "juicyway",
    async convert(req: OfframpRequest) {
      return logExternalCall(
        "offramp",
        "juicyway.convert",
        {
          targetNgn: req.targetNgn,
          stablecoinSymbol: req.stablecoinSymbol,
          idempotencyKey: req.idempotencyKey,
        },
        async () => {
          const stablecoinMinor = Number(req.stablecoinAmount);
          if (!Number.isFinite(stablecoinMinor) || stablecoinMinor <= 0) {
            throw new Error("invalid stablecoin amount");
          }

          // 1) Lock FX rate (USDC/USD → NGN)
          const rate = await juicywayRequest<{ id: string }>(
            "POST",
            "/exchange/fx/aggregator-rates/lock",
            {
              source_currency: req.stablecoinSymbol === "USDT" ? "USDT" : "USDC",
              target_currency: "NGN",
              amount: stablecoinMinor,
            },
          );

          // 2) Convert stablecoin balance to NGN
          await juicywayRequest("POST", "/exchange/fx/convert", {
            rate_id: rate.id,
            source_currency: req.stablecoinSymbol === "USDT" ? "USDT" : "USDC",
            target_currency: "NGN",
            amount: stablecoinMinor,
            reference: `swap-${req.idempotencyKey}`,
          });

          // 3) Payout NGN to operator beneficiary (float / Zap funding account)
          const amountKobo = Math.round(req.targetNgn * 100);
          const payout = await juicywayRequest<{ id: string }>(
            "POST",
            "/payouts",
            {
              amount: amountKobo,
              beneficiary: {
                id: config.beneficiaryId,
                type: "bank_account",
              },
              description: "personal-cfo-agent off-ramp",
              destination_currency: "NGN",
              reference: req.idempotencyKey,
              source_currency: "NGN",
              fee_charged_to: "sender",
              ...(config.payoutPin ? { pin: config.payoutPin } : {}),
            },
          );

          return {
            reference: payout.id,
            ngnAmount: req.targetNgn,
          };
        },
      );
    },
  };
}
