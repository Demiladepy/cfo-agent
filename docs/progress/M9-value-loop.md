# M9 — Value loop (Index float + off-ramp + FX)

**Status:** Complete  
**Date:** 2026-06-25

## Delivered

### 1. Real NGN float from Index
- `index.getNgnBalance()` on the Index client
- MCP balance tool discovery with `INDEX_MCP_BALANCE_TOOL` override
- Mock / unavailable MCP → simulated balance + `logger.warn`
- Demo `/api/status` reads live float from Index client (simulated when MCP not configured)

### 2. Off-ramp in `executeSendNgnFlow`
- Flow: **wallet → LI.FI → off-ramp → Index transfer**
- `offramp.convertToNgn()` policy-gated as `kind: offramp`, `category: offramp`
- `category_caps.offramp` in policy schema + example config
- Idempotency keys on off-ramp calls (shared store with Index)
- Dry-run simulates convert and tops up in-memory NGN float before transfer

### 3. Live FX rate
- `fx.getUsdToNgn()` with 60s cache
- Juicyway `getUsdToNgnRate()` via FX lock quote endpoint
- `FX_FALLBACK_USD_NGN` env (default 1500) with logged warning on fallback
- Replaced hardcoded `shortfall / 1500` in send flow

## Acceptance

| Criterion | Result |
|-----------|--------|
| `sendNgnFlow` reads NGN via Index client (fallback + warning) | ✅ |
| Off-ramp in flow: policy, audit, idempotent, dry-run-safe | ✅ |
| FX live (cached) with fallback | ✅ |
| Unit tests: balance, wiring, FX | ✅ |
| Integration: wallet → LI.FI → offramp → Index audit order | ✅ |

## Env

| Variable | Purpose |
|----------|---------|
| `INDEX_MCP_BALANCE_TOOL` | Override MCP tool name for NGN balance |
| `FX_FALLBACK_USD_NGN` | USD/NGN when provider quote fails |

## Notes

- `SendNgnIntent.ngnBalanceNgn` is now optional caller fallback only.
- `pnpm dev` CLI still boots placeholders; full loop runs via demo server and `executeSendNgnFlow`.
