# State of programmable off-ramps in Nigeria, 2026

*Updated June 2026 — operator publishes*

## Operator note

**Yellow Card** (`docs.yellowcard.engineering`) was unreachable during integration. Default provider switched to **Juicyway**.

## Landscape

| Provider | NGN rails | API status (Jun 2026) | Fit for this agent |
|----------|-----------|------------------------|-------------------|
| **Juicyway** | Bank, stablecoins, FX swap | ✅ [docs.juicyway.com](https://docs.juicyway.com/home) live | **Default** — USDC→NGN FX + `/payouts` |
| **Onramp.money** | NG-BANK-TRANSFER | ✅ Whitelabel off-ramp API | Backup — KYC-heavy, good if compliance outsourced |
| **Yellow Card** | Bank, mobile money | ⚠️ Engineering docs down | Was first choice; re-enable when site returns |
| **Onafriq** | Mobile money, bank | Enterprise | Remittance scale, not personal CFO |

## Implemented: Juicyway

`src/offramp/providers/juicyway.ts` runs:

1. `POST /exchange/fx/aggregator-rates/lock` — lock USDC/USDT → NGN rate
2. `POST /exchange/fx/convert` — convert stablecoin balance to NGN
3. `POST /payouts` — send NGN to `JUICYWAY_BENEFICIARY_ID` (your float account)

Sandbox base URL: `https://api-sandbox.spendjuice.com`

### Operator setup

1. Sign up at Juicyway sandbox dashboard
2. Settings → API Keys → copy sandbox key → `JUICYWAY_API_KEY`
3. Create NGN bank beneficiary (your Paystack float / personal account) → `JUICYWAY_BENEFICIARY_ID`
4. Set `OFFRAMP_PROVIDER=juicyway`
5. Test in dry-run first; live needs `LIVE_EXECUTION=true` + `--live`

### Caveats

- API paths verified against public docs; sandbox may differ slightly — adjust in `juicyway.ts` if Juicyway support gives corrected paths.
- `JUICYWAY_PAYOUT_PIN` required in production for some accounts.
- Stablecoin must be deposited to Juicyway balance before FX convert (or use their stablecoin transfer APIs upstream).

## Yellow Card (deferred)

When engineering docs return, re-add provider in `src/offramp/providers/yellowcard.ts` and set `OFFRAMP_PROVIDER=yellowcard`.

## Onramp.money (future)

Whitelabel off-ramp: quote → createTransaction → poll/webhook. Good fallback if Juicyway KYC onboarding is slow.
