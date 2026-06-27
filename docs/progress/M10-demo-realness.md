# M10 — Demo realness (honest balances & sandbox badge)

**Status:** Complete  
**Date:** 2026-06-25

## Delivered

### 1. Reliable Sepolia RPC default
- Replaced dead `rpc.sepolia.org` with Cloudflare public gateway in `config/wallet.example.yaml`
- Comments document keyed-provider swap for production and alternative public endpoints
- Demo `mockWalletRpc` default flipped to **false** (real RPC reads when configured)

### 2. `/api/status` — real reads, no fabrication
- New `src/demo/status.ts` — `buildDemoStatus()` aggregates:
  - **ETH / USDC** via `wallet.readBalances()` (live RPC or mock client)
  - **NGN** via `index.getNgnBalance()` (live MCP or simulated float)
- Failed reads return `{ value: null, source: 'unavailable', reason }` — never fallback numbers
- Send scenario no longer assumes ₦10k when Index balance is unknown (uses `0`)

### 3. Demo UI honesty
- Balance cards show `—` when unavailable; status dots + tooltips per field
- Integration strip: Wallet RPC · Index MCP · LI.FI · Claude with live / mock / unavailable dots
- Stack panel aligned with layer status from the same source

### 4. Sandbox badge strictness
- `sandbox: true` when **any** of: `dryRun`, `mockWalletRpc`, mock Index, mock LI.FI
- Nav badge uses `sandbox`, not `dryRun` alone — cannot show green “Live” with mocked layers

## API shape

```typescript
{
  dryRun: boolean;
  sandbox: boolean;
  killSwitchActive: boolean;
  policy: { perTxCapNgn, dailyCapNgn, confirmThresholdNgn };
  balances: {
    ngn: { value: number | null; source: 'live' | 'mock' | 'unavailable'; reason? };
    usdc: …;
    eth: …;
  };
  layers: [{ id, label, status, reason? }];  // wallet, index, lifi, anthropic
  stack: [{ label, status }];                 // legacy integrations panel
}
```

## Acceptance

| Criterion | Result |
|-----------|--------|
| `/api/status` returns real wallet balances when RPC works | ✅ |
| Failed wallet → `null` + `reason` | ✅ |
| UI shows mock vs live per source | ✅ |
| Sandbox badge off only when all layers live and not dry-run | ✅ |
| Tests: `status.test.ts` + updated `server.test.ts` | ✅ |
| README demo section updated | ✅ |

## Notes

- Demo server tests use `mockWalletRpc: true` for CI stability (no external RPC).
- Production operators should copy `wallet.example.yaml` → `wallet.yaml` and set a keyed RPC URL.
- Claude layer shows `missing` (not mock) when `ANTHROPIC_API_KEY` is unset — chat falls back gracefully.
