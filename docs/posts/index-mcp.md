---
title: "Connecting Index over MCP for agentic commerce"
status: "DRAFT — DO NOT PUBLISH until Index public launch"
publish-after: "Index public launch + operator approval"
word-target: 1800
---

# Connecting Index over MCP for agentic commerce

> **DO NOT PUBLISH** until Index public launch. Do not link to vendor marketing sites or pre-launch docs in any published version. This outline is for internal DevRel prep only.

*Outline only — operator writes prose.*

## Hook

- Commerce primitives (airtime, bills, transfers) exposed as MCP tools — my agent never calls them raw
- Every invocation passes policy + idempotency first

## Wrapper design

```
CLI / Agent / Demo → createIndexClient → policy.evaluate → idempotency → MCP transport
```

- `createIndexMcpTransport` uses Streamable HTTP MCP client (`@modelcontextprotocol/sdk`)
- Tool name discovery with env overrides: balance, airtime, transfer
- Mock layer (`createMockIndexMcp`) for CI and keyless demo

## Policy + idempotency

- Idempotency keys in SQLite `facts` table — duplicate returns `DUPLICATE` without second spend
- Transfers above `confirm_threshold_ngn` → `CONFIRM_REQUIRED` → M11 pending confirmation table
- Kill switch denies before MCP call

## NGN balance (M9)

- `getNgnBalance()` calls balance MCP tool when live
- Unavailable MCP → simulated float + structured warning log — demo status marks `mock`
- Rebalance trigger uses same read path

## Test mode vs live

- Mock: synthetic references, in-memory idempotency, fixed simulated balance
- Live: requires URL + API key env vars; integration tests still mock in CI
- Honest admission: I have not run production spend against live Index server in this repo yet — blocked on launch credentials

## Confirmation flow

- Demo: `POST /api/demo/send` returns `202` + pending id
- CLI: `confirm list` / `confirm <id> y`
- Rebalance top-up (M13) uses same pending table with `rebalance_topup` action type

## What worked

- MCP tool surface maps cleanly to policy action kinds
- Mock transport let M4–M11 ship without vendor sandbox access

## What didn't / risks

- Tool name drift if Index renames MCP tools — overrides exist but operator must monitor
- Streamable HTTP auth errors surfaced as `unavailable` — good for UI, easy to misread as "zero balance"
- Double-submit protection depends on operator supplying stable idempotency keys on retries

## Pre-launch checklist for prose (when allowed to publish)

- [ ] Operator has run live airtime + transfer at small notional
- [ ] Balance tool verified against real float
- [ ] Legal/comms cleared to name vendor
- [ ] Remove all "DO NOT PUBLISH" banners

## Failure modes

- MCP 401 → mock fallback in dev if misconfigured (dangerous — document env validation)
- Confirm expiry (5 min TTL) mid-operator-review
- Partial send flow: LI.FI/off-ramp simulated before transfer confirm — timeline resume on approve

## CTA (post-launch only)

- Repo Index module + demo send scenario
- Link to go-live checklist Index section
