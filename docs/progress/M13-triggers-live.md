# M13 — Live triggers (scheduler + rebalance + UI/CLI)

**Status:** Complete  
**Date:** 2026-06-27

## Delivered

### 1. Trigger composition in `createAppContext`
- `TRIGGERS_ENABLED=true` (default **off**) starts `TriggerManager` on boot
- Disabled automatically when `NODE_ENV=test`
- Jobs:
  - **rebalance-check** — `TRIGGERS_REBALANCE_CRON` (default `*/15 * * * *`)
  - **reflection** — daily `0 23 * * *` local timezone

### 2. Rebalance flow (`executeRebalanceTopup`)
- Reads NGN float via `index.getNgnBalance()` (M9)
- Policy gate on `kind: offramp` before routing
- **Below confirm threshold** → auto LI.FI quote + route (respects session dry-run)
- **At confirm threshold** → `pending_confirmations` + audit alert (`trigger_rebalance_confirm`)
- **Above hard cap / deny** → policy deny + audit (no execution)
- Confirm approve resolves via extended `resolvePendingConfirmation` (`rebalance_topup` type)

### 3. Boot dry-run HARD RULE
- First run of each job after process boot **always dry-run**, regardless of `LIVE_EXECUTION`
- One-time log: `trigger {name} ran in dry-run on boot; live runs from next interval`
- Dedicated test fails if rule/log constant removed

### 4. Pause / resume
- File flags: `data/<app>/triggers/<job>.pause`
- Demo UI Triggers panel + CLI `triggers pause|resume|run`

### 5. Surfaces
| Surface | Commands / endpoints |
|---------|---------------------|
| Demo API | `GET /api/triggers`, `POST /api/triggers/:job/{pause,resume,run}` |
| Demo UI | Triggers panel with schedule, last/next run, outcome, pause/resume/run |
| CLI REPL | `triggers status`, `triggers pause|resume|run <job>` |

## Acceptance

| Criterion | Result |
|-----------|--------|
| `TRIGGERS_ENABLED=true` starts scheduler; demo panel shows state | ✅ |
| Rebalance fires under low balance via policy + audit | ✅ |
| First-boot dry-run rule tested | ✅ |
| Pause/resume via UI and CLI | ✅ |
| Triggers off in test suite by default | ✅ |

## Env

| Variable | Default | Purpose |
|----------|---------|---------|
| `TRIGGERS_ENABLED` | `false` | Master switch |
| `TRIGGERS_REBALANCE_CRON` | `*/15 * * * *` | Rebalance schedule |
| `REBALANCE_TARGET_NGN` | `100000` | Float target |

## Notes

- Demo: set `TRIGGERS_ENABLED=true` in `.env` and restart `pnpm demo`.
- Reflection job writes `trigger.reflection` event; never auto-applies procedural suggestions.
- `runRebalanceCheck` in `scheduler.ts` retained for unit tests; manager uses `executeRebalanceTopup` directly.
