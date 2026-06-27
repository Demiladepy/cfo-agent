# M11 — Policy confirm flow (HTTP + demo UI)

**Status:** Complete  
**Date:** 2026-06-25

## Delivered

### 1. Pending confirmations (SQLite)
- Migration v2: `pending_confirmations` table (`id`, `action_json`, `policy_snapshot_json`, `created_at`, `expires_at`, `status`)
- Default TTL 5 minutes; stale rows auto-expire to `expired`
- `src/memory/pending-confirmations.ts` — insert, list active, status updates

### 2. Confirm bridge
- `src/confirm/bridge.ts` — `createConfirmBridge()` wired into demo `createAppContext`
- Index `onConfirmRequired` receives full policy action context; **never auto-approves**
- Persists pending record + `auditSubtype: confirmation_requested`
- Resume path uses one-shot `beginResume(id)` so approved transfer passes policy confirm gate

### 3. Demo HTTP API
| Endpoint | Behavior |
|----------|----------|
| `POST /api/demo/send` | On policy `confirm`, returns `202` with `pendingConfirmationId` (non-blocking) |
| `GET /api/confirm/pending` | Active pending items with caps snapshot for UI |
| `POST /api/confirm/:id` | `{ decision: 'y' \| 'n' }` — approve completes transfer, deny/expired/kill → denied |

### 4. Demo UI
- Banner below header when pending confirmation exists
- Shows reason, transfer details, daily cap consumption, confirm threshold, expiry
- **Approve** / **Deny** call real `/api/confirm/:id` endpoints
- Timeline step shows `pending` on Index transfer while awaiting operator

### 5. Audit lifecycle
New `metadata.auditSubtype` values (existing fields unchanged):
- `confirmation_requested`
- `confirmation_decided` (approve/deny + kill-switch deny)
- `confirmation_expired`
- `confirmation_outcome` (completed or failed after approve)

### 6. Demo policy
- `DEMO_POLICY.confirm_threshold_ngn` lowered to **₦50,000** so the default “send to mom” scenario triggers confirm

## Acceptance

| Criterion | Result |
|-----------|--------|
| Send via API returns pending id | ✅ |
| `POST /api/confirm/:id` with `y` completes flow | ✅ |
| Expired confirmation returns 410 | ✅ |
| UI contract / banner fields via `/api/confirm/pending` | ✅ |
| Audit shows confirmation lifecycle | ✅ |
| Kill switch denies approval even if operator approves | ✅ |
| `policy.evaluate` signature unchanged | ✅ |

## Notes

- LI.FI / off-ramp steps may run before transfer confirm in send flow (dry-run simulated). Pending record stores prior actions for timeline resume on approve.
- Airtime purchases above threshold still require confirm; demo banner flow is optimized for the send scenario.
- Tests use `mockWalletRpc: true` for CI stability.
