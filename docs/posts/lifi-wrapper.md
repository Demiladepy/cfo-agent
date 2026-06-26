# Wrapping LI.FI for an autonomous spender

*Draft — not for publication*

## Why LI.FI

My personal CFO agent needs to move value across chains without building routing logic myself. LI.FI aggregates bridges and DEXs. The hard part isn't calling their API — it's knowing when **not** to execute.

## Architecture

Three layers between the SDK and the agent:

1. **Quote** — fetch route, normalize to our `RouteQuote` type
2. **Sanity-check** — slippage, hops, fee %, freshness (routes go stale fast)
3. **Policy gate** — `policy.evaluate` on the destination address and notional before any execute

Dry-run is default. Live requires `LIVE_EXECUTION=true` and `--live` on the CLI. Both. Not one or the other.

## What worked

- Isolating the SDK behind `LifiSdk` interface made tests trivial — mock returns a fixed route, assert denial paths without hitting the network.
- Checking kill switch before policy saved a round-trip on obvious stops.

## What didn't

- Fee estimation in USD is approximate. Our sanity check uses `feeCostUsd + gasCostUsd` from the quote; on testnet these numbers are often zero or nonsense. Production needs a notional floor.

## Open questions

- How to handle `confirm` decisions from policy during autonomous execution — currently we deny and surface the reason. Human-in-the-loop CLI prompt is M4/M5 territory.
