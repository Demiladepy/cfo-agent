# M12 — Interactive CLI REPL

**Status:** Complete  
**Date:** 2026-06-25

## Delivered

### 1. `pnpm dev` → interactive REPL
- Replaced placeholder boot exit with `src/cli/repl.ts`
- Uses `createAppContext()` via `CliSession` — same composition as demo server (confirm bridge, real integrations)
- Data directory from `DATABASE_PATH`; kill switch from `KILL_SWITCH_PATH`

### 2. Commands
| Command | Implementation |
|---------|----------------|
| `status` | `buildDemoStatus()` — live/mock/unavailable balance markers |
| `send` | `executeSendNgnFlow` + pending confirm id when threshold hit |
| `airtime` | `index.purchaseAirtime` |
| `quote` | `lifi.quote` only — hops, fees, slippage, totals |
| `policy show` | shared `showPolicy()` with `pnpm policy show` |
| `audit tail [n]` | shared `formatAuditEntries()` with `pnpm audit tail` |
| `confirm list` / `confirm <id> y\|n` | M11 `pending_confirmations` table |
| `kill` / `resume` | file flag toggles |
| `live on` / `live off` | session toggle; requires `LIVE_EXECUTION=true` in env |
| `help` / `exit` | help text / clean shutdown |

### 3. Session live mode
- Default: dry-run
- `live on` recreates `AppContext` with `dryRun: false` when env allows
- `live off` returns to dry-run
- Cannot override missing `LIVE_EXECUTION` env var

### 4. Tests
- `src/cli/__tests__/repl.test.ts` — scripted input: status, send → audit, quote, live guard
- Send test asserts audit contains `transfer` + `allow` decisions

## Acceptance

| Criterion | Result |
|-----------|--------|
| `pnpm dev` opens REPL | ✅ |
| `status` shows real or clearly-marked-unavailable data | ✅ |
| Every command exercises real code paths | ✅ |
| CLI integration test: send → policy → wallet → LI.FI mock → Index mock → audit | ✅ |
| README CLI section updated | ✅ |

## Notes

- `src/app/boot.ts` unchanged — still used by boot unit test; `pnpm dev` no longer calls it.
- REPL uses `policy.example.yaml` in tests; operators should copy to `config/policy.yaml`.
- `mockWalletRpc: true` in tests only — production REPL uses real RPC reads.
