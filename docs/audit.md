# Codebase audit — Personal CFO Agent

**As of:** M13 (2026-06-27)  
**Tests:** 101 passing across 31 files (`pnpm test`)

This document is the operator-facing inventory of what is built, what is simulated, and what remains before production use with real money.

---

## Milestone status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M0 Foundation | ✅ | SQLite, logging, migrations, vitest |
| M1 Policy | ✅ | Caps, velocity, allowlist, kill switch, audit |
| M2 Wallet | ✅ | Encrypted keystore, viem, dry-run signing |
| M3 LI.FI | ✅ | Quote, sanity-check, policy gate, SDK adapter |
| M4 Index MCP | ✅ | Transport + mock; policy + idempotency wrapper |
| M5 Agent | ✅ | Claude loop, injection detection, canonical send flow |
| M6 Off-ramp | ✅ | Juicyway provider; Yellow Card deferred |
| M7 Memory | ✅ | Episodic/semantic/procedural, reflection reports |
| M8 Triggers (stub) | ✅ | `runRebalanceCheck` + scheduler unit tests |
| M9 Value loop | ✅ | Index NGN balance, off-ramp in send flow, live FX |
| M10 Demo realness | ✅ | Honest `/api/status`, sandbox badge |
| M11 Confirm flow | ✅ | `pending_confirmations`, demo banner + HTTP |
| M12 CLI REPL | ✅ | `pnpm dev` interactive operator shell |
| M13 Triggers live | ✅ | Cron manager, rebalance flow, UI/CLI pause |

---

## Component inventory

| Component | Path | Built | Live-ready |
|-----------|------|-------|------------|
| Policy engine | `src/policy/` | ✅ | ✅ — config via `policy.yaml` |
| Wallet | `src/wallet/` | ✅ | ✅ — needs funded Sepolia + RPC |
| LI.FI client | `src/lifi/` | ✅ | ⚠️ — SDK live when `LIFI_INTEGRATOR` set |
| Index MCP | `src/index/` | ✅ | ⚠️ — live when `INDEX_MCP_URL` + key set |
| Off-ramp | `src/offramp/` | ✅ | ⚠️ — Juicyway sandbox wired |
| Memory | `src/memory/` | ✅ | ✅ |
| Agent (Claude) | `src/agent/` | ✅ | ⚠️ — needs `ANTHROPIC_API_KEY` |
| Confirm bridge | `src/confirm/` | ✅ | ✅ |
| Triggers | `src/triggers/` | ✅ | ⚠️ — `TRIGGERS_ENABLED=true` |
| CLI REPL | `src/cli/repl.ts` | ✅ | ✅ |
| Demo server | `src/demo/` | ✅ | ✅ — dry-run default |
| App composition | `src/app/create-tools.ts` | ✅ | ✅ |

---

## Integration modes (runtime)

Resolved at boot via `createAppContext` / env:

| Layer | Live when | Mock / fallback when |
|-------|-----------|----------------------|
| Wallet RPC | Real viem client, no `mockWalletRpc` | Demo tests set `mockWalletRpc: true` |
| Index MCP | `INDEX_MCP_URL` + `INDEX_MCP_API_KEY` | `createMockIndexMcp()` — simulated NGN float |
| LI.FI SDK | `LIFI_INTEGRATOR` registered | Fixed mock route quotes |
| Claude | `ANTHROPIC_API_KEY` | Chat returns 400; status shows `missing` |
| Off-ramp | `JUICYWAY_API_KEY` + beneficiary | Dry-run simulated convert |
| Triggers | `TRIGGERS_ENABLED=true`, not `NODE_ENV=test` | Off by default |

Demo `/api/status` reports `live` | `mock` | `unavailable` per layer — never fabricates numbers.

---

## Safety constraints (verified)

| Rule | Implementation | Test coverage |
|------|----------------|---------------|
| Policy before every money move | `policy.evaluate` in clients + flow | Policy unit + integration tests |
| Encrypted keystore only | `src/wallet/keystore.ts` | Wallet tests, log redaction |
| Kill switch before mutating calls | File flag check in policy engine | Kill switch tests |
| Dry-run default | `LIVE_EXECUTION` + session/`--live` | CLI + demo tests |
| LI.FI destination allowlist | Policy on swap/offramp actions | LI.FI sanity + policy tests |
| Index confirm threshold | Policy + confirm bridge | M11 confirm tests |
| Tool results = data | System prompt + regex injection gate | `claude.test.ts`, injection test |
| No off-machine telemetry | pino to stdout only | Manual review |
| Trigger boot dry-run | `TriggerManager` first-run rule | `manager.test.ts` dedicated test |

---

## Known gaps (production)

1. **Index MCP credentials** — transport is built; operator needs live URL + API key from Index launch.
2. **LI.FI live execute** — quotes work with integrator; testnet/mainnet execute needs funded wallet + `--live`.
3. **Juicyway production** — sandbox paths verified; production beneficiary + payout PIN required.
4. **Yellow Card provider** — stub only; docs were down at M6; re-enable when operator has API access.
5. **Onramp.money** — researched, not wired.
6. **Calendar / email triggers** — SPEC non-goal for M8; not implemented.
7. **Coverage gate 80%** — not enforced in CI; policy/wallet/lifi/index have substantial tests but no coverage reporter wired.
8. **Multi-chain wallet** — Sepolia-focused; policy allowlist is single-operator scope.

---

## Surfaces

| Surface | Entry | Money-moving? |
|---------|-------|---------------|
| `pnpm dev` REPL | `src/cli/repl.ts` | Yes — policy-gated |
| `pnpm demo` UI | `http://localhost:4173` | Yes — dry-run default |
| Demo chat | `POST /api/chat` | Yes — via Claude tools |
| Triggers cron | `TriggerManager` | Yes — boot dry-run first |
| Scripts | `pnpm kill`, `pnpm audit`, `pnpm policy` | No |

---

## Data layout

| Path | Purpose |
|------|---------|
| `data/agent.db` (or `DATABASE_PATH`) | SQLite: events, facts, audit, pending confirmations |
| `data/keystore.json` | Encrypted wallet |
| `data/demo/triggers/` | Trigger pause flags + `state.json` |
| `os.tmpdir()/agent.kill` | Kill switch (override via `KILL_SWITCH_PATH`) |

---

## Dependencies (locked stack)

- Node 20+, pnpm, TypeScript strict
- viem, `@lifi/sdk`, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`
- better-sqlite3, zod, pino, node-cron, vitest

---

## Recommendation

Safe for **demo, dry-run, and operator-supervised live** with explicit env flags. Not ready for unattended live triggers + live execute without: funded accounts on all layers, production RPC, Index credentials, and operator review of go-live checklist.

See [`go-live-checklist.md`](go-live-checklist.md) for per-layer requirements.
