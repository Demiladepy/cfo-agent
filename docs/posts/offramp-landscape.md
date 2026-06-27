---
title: "State of programmable off-ramps in Nigeria, 2026"
status: outline
publish-after: "After Juicyway sandbox validated in production"
word-target: 2200
---

# State of programmable off-ramps in Nigeria, 2026

*Outline only — operator writes prose. Input: [`docs/offramp-providers.md`](../offramp-providers.md).*

## Hook

- Personal CFO agent holds USDC on-chain, spends NGN via Index — something has to convert between them
- I evaluated five names; only one is wired in code today

## What “programmable” means here

- HTTP API, idempotent payouts, webhook or poll status — not OTC desk phone calls
- Must fit autonomous agent: quote → lock rate → convert → payout to **my** float account
- KYC and minimums matter as much as API shape

## Provider snapshot (June 2026)

### Juicyway — **implemented default**

- Docs live at docs.juicyway.com
- Flow we ship: FX rate lock → stablecoin convert → `/payouts` to beneficiary
- Sandbox: `api-sandbox.spendjuice.com`
- Honest caveat: stablecoin must land in Juicyway balance before FX convert; we don't automate deposit yet
- What worked: clearest API docs of the set we tried
- What didn't: sandbox path drift — operator may need support to confirm endpoint versions

### Yellow Card — **deferred**

- Engineering docs (docs.yellowcard.engineering) were **down** during M6 integration — site appears back now
- Payments API: crypto → NGN bank disbursement via send/submit flow; 16+ African markets
- Fit: strong if you want treasury + disbursement as one vendor
- Why we skipped: couldn't verify API against live docs at build time; stub provider remains in repo
- Revisit: `OFFRAMP_PROVIDER=yellowcard` when operator has business API keys

### Onramp.money — **researched, not wired**

- Whitelabel off-ramp: quote → createTransaction → deposit address → webhook/poll
- Nigeria supported; KYC mandatory; OTP in their UI flow
- OTC desk minimum ~$10k — whitelabel API may differ; confirm with sales
- Fit: backup if Juicyway onboarding slow; heavier compliance surface

### Onafriq — **wrong shape for this agent**

- Pan-African payments gateway — mobile money, agent banking (Baxi 460k agents in Nigeria)
- Enterprise remittance scale, not “USDC in → my Index float out”
- Useful reference for last-mile rails, not our primary integration target

### Lemfi — **consumer remittance, not agent API**

- Diaspora send app — wallet + FX for individuals
- No clear programmatic off-ramp API for autonomous treasury top-up
- Mention as contrast: user-facing vs infrastructure-facing products

## Architecture fit

```
USDC (wallet) → LI.FI (if needed) → off-ramp provider → NGN bank → Index float
```

- Off-ramp is optional if Index float is pre-funded — honest hackathon path
- Policy treats off-ramp as `category: offramp` with daily cap

## What I'd do differently

- Start with provider that documents sandbox end-to-end, not brand prestige
- Build interface first (`OfframpProvider`) — Juicyway slot-in took one afternoon once docs were readable

## Risks

- Rate lock expiry mid-flow
- Payout PIN / 2FA on production accounts blocking headless agents
- Regulatory: Nigeria crypto↔fiat rules move fast — disclaimer in post

## Open questions for operator prose

- Yellow Card vs Juicyway fee comparison at ₦100k–₦500k notionals
- Whether Index will bundle off-ramp later (would collapse this layer)

## CTA

- Repo off-ramp module + env template in `.env.example`
