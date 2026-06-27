---
title: "Wrapping LI.FI for an autonomous spender"
status: outline
publish-after: "M3 shipped — publish when operator ready"
word-target: 1800
---

# Wrapping LI.FI for an autonomous spender

*Outline only — operator writes prose.*

## Hook

- I needed cross-chain liquidity without building routing myself
- LI.FI aggregates bridges and DEXs; the hard part is knowing when **not** to execute

## Why three layers between SDK and agent

- **Quote** — fetch route, normalize to internal `RouteQuote` type
- **Sanity-check** — slippage, hop count, fee % of notional, route freshness (routes go stale in minutes)
- **Policy gate** — `policy.evaluate` on destination address and notional **before** execute

## Dry-run-first SDK adapter

- `LifiSdk` interface isolates `@lifi/sdk` behind testable boundary
- `resolveLifiSdk`: mock when no `LIFI_INTEGRATOR`, live SDK otherwise
- Execute path respects session `dryRun` — simulated tx hash, no broadcast
- Live requires `LIVE_EXECUTION=true` **and** CLI `--live` / session toggle — both, not either

## Policy as swap gate

- Route evaluated as `kind: swap` with notional in NGN equivalent
- Deny → audit + stop; confirm → surface reason (M11/M13 handle human loop)
- Kill switch checked before policy to avoid pointless quote round-trips

## Route freshness

- `createdAt` on quote compared to max age in config
- Stale route rejection tested — autonomous spender must not execute expired paths
- Open question: refresh quote automatically vs fail and wait for next cron interval

## What worked

- Mock SDK made denial-path tests trivial — no network in CI
- Sanity checks caught absurd testnet fee data before we trusted it
- Logging every external call with duration made demo debugging painless

## What didn't work / honest failures

- Testnet `feeCostUsd` and `gasCostUsd` are often zero or nonsense — sanity floor needs production tuning
- Fee-in-USD approximation breaks on exotic routes; we use quote metadata, not on-chain simulation
- First production execute will need operator watching — I haven't run live mainnet from triggers yet

## Failure modes to document

- Quote succeeds, execute reverts (insufficient gas, slippage exceeded)
- Policy allowlist missing new bridge destination
- LI.FI integrator not registered — silent fallback to mock in dev (dangerous if misconfigured)
- Trigger boot dry-run (M13) prevents wake-up surprise — mention as pattern for any cron executor

## Code pointers (for operator draft)

- `src/lifi/client.ts`, `src/lifi/sdk.ts`, `src/lifi/sanity.ts`
- Integration test: policy denial before execute

## CTA

- Link to repo demo: send flow with low NGN float routes USDC automatically
