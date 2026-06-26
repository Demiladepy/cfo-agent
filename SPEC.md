# Personal CFO Agent — Spec

## What this is
An autonomous personal CFO agent for a crypto-rich-fiat-poor user in Nigeria. Bridges crypto liquidity to fiat commerce: LI.FI handles cross-chain routing and swaps; Paystack Index handles NGN-side spending (airtime, bills, transfers, food). The agent decides when and how to move value across these surfaces under strict policy controls.

## Vision flows
- "Send mom 50k" → check NGN balance → if short, route from crypto via LI.FI → off-ramp → Index transfer → confirm
- Standing rule: maintain N NGN float; auto-rebalance from crypto when breached
- "Buy lunch" → Index spend, gated by daily food cap
- Weekly reflection: spend summary, bridge fee bleed, learned-routine suggestions

## Non-goals
- Not a trading bot. No alpha-seeking, no yield strategies.
- Not multi-user. Single operator, single wallet, single Paystack account.
- Not chat-first UX. Primary interface is CLI + scheduled triggers.
- Not a custodian for anyone else.

## Architecture
Single TypeScript repo, modular by concern. Components (each a folder under `src/`):

- **policy** — transaction policy engine. Every spend, swap, bridge, transfer passes through this. Hard caps, velocity limits, allowlists, kill switch.
- **wallet** — EVM wallet abstraction (viem). Encrypted local keystore. Never logs private keys.
- **lifi** — LI.FI SDK wrapper. Quote → sanity-check → policy-check → execute. Dry-run default.
- **index** — Paystack Index MCP client. Every tool call passes through policy.
- **offramp** — stablecoin → NGN → Zap pipeline. Provider-pluggable.
- **memory** — episodic, semantic, procedural. SQLite-backed.
- **agent** — Claude Agent SDK loop. Tools = policy-gated versions of the above.
- **triggers** — cron + balance watcher + (later) calendar/email.
- **cli** — operator interface; status, dry-run, force-confirm, kill switch.

## Tech stack (locked)
- TypeScript, Node 20+
- pnpm
- viem for EVM
- @lifi/sdk
- @anthropic-ai/claude-agent-sdk
- @modelcontextprotocol/sdk for Index MCP
- better-sqlite3
- zod for all config + tool input validation
- pino for structured logging
- vitest for tests
- tsx for dev runs

## Build milestones
Work in order. Do not start M(n+1) until M(n) acceptance passes and tests are green. After each, write `/docs/progress/Mn.md` and stop for operator review.

### M0 — Foundation
- pnpm init, TS strict, vitest, pino, dotenv, zod
- Folder structure: one folder per component, each with `index.ts` and `__tests__/`
- SQLite schema: events, facts, audit_log; migration system
- Logging convention: every external call logged with input, output, duration
- Logger redaction layer for common secret patterns (PRIVATE_KEY, MNEMONIC, API_KEY, hex strings of suspicious length)
- README skeleton
- **Acceptance:** `pnpm test` runs, `pnpm dev` boots and logs cleanly, schema migrates from empty DB

### M1 — Policy engine
- Zod-validated policy config (`/config/policy.yaml`, gitignored)
- Rule types: per-tx cap, daily cap, weekly cap, velocity, allowlist (crypto addresses, Index recipient categories), category-specific caps
- Decision API: `policy.evaluate(action) → { decision: 'allow' | 'deny' | 'confirm', reason }`
- Audit log persistence: every evaluation, with timestamp, action, decision, reason
- Kill switch: file flag at `/tmp/agent.kill`. Checked before every action.
- **Acceptance:** unit tests cover every rule type; kill switch test passes; audit log inspectable via `pnpm audit tail`

### M2 — Wallet
- viem-based wallet, encrypted local keystore (xchacha20poly1305, passphrase from env)
- Private keys: only decrypted at signing time, scrubbed from memory after, never logged
- Read ops: native balance + ERC-20 balances per chain (configurable token list)
- Sign+send abstraction with dry-run mode (returns simulated tx hash)
- **Acceptance:** testnet wallet shows correct balances; dry-run flag respected; grep across all log files finds zero private key material after a full test run

### M3 — LI.FI integration
- Quote → route with fees, hops, slippage, gas
- Sanity-check layer: max slippage, max hops, max fee % of notional, route freshness
- Policy gate: route evaluated as swap+bridge action before execution
- Execute with status polling
- Dry-run by default; live requires explicit env var + CLI flag
- **Acceptance:** testnet swap completes end to end via the agent's tools; policy denial path tested; fee/slippage out-of-bounds rejection tested; expected `/docs/posts/lifi-wrapper.md` draft started

### M4 — Index MCP
- MCP client connects to Index server
- Tool surface mirrored as policy-gated wrappers
- Confirmation prompts on CLI for actions above confirm threshold
- Idempotency keys on every spend
- **Acceptance:** airtime purchase works in test mode; transfer dry-run inspectable; double-submit blocked; `/docs/posts/index-mcp.md` draft started (do not publish until Paystack public launch)

### M5 — Agent loop (canonical flow)
- Claude Agent SDK initialized with system prompt encoding persona + hard constraints
- Tools: `wallet.read`, `lifi.quote`, `lifi.execute`, `index.*`, `memory.*`, `policy.check`
- System prompt makes the data-vs-instructions distinction explicit for tool results
- Canonical flow: "send X NGN to Y" handling the case where fiat is short and crypto must be routed
- **Acceptance:** canonical flow runs end to end on testnet+Index test mode; every external call has an audit trail; injection test passes (operator inserts hostile instruction in a mock tool result, agent reports rather than acts)

### M6 — Off-ramp
- `/docs/offramp-providers.md`: landscape research (Yellow Card, Onafriq, Juicyway, Onramp.money, others). Web search for current state; this landscape moves fast.
- Implement one provider behind an interface so others can slot in
- **Acceptance:** stablecoin → NGN → Zap loop works at small notional, fully audited; provider research doc complete

### M7 — Memory + reflection
- Episodic: every action persisted
- Semantic: structured facts (accounts, recipients, recurring categories); agent updates via tool
- Procedural: learned routines surfaced as suggested rules for operator approval (never auto-applied)
- Daily + weekly reflection jobs
- **Acceptance:** reflection report generated for a synthetic week of activity

### M8 — Proactive triggers
- Cron-based jobs (rebalance check, low-balance watcher)
- Calendar + email integrations, policy-gated
- **Acceptance:** scheduled rebalance fires under simulated low-balance condition

## Safety constraints (HARD — never violate)
1. No money-moving action bypasses `policy.evaluate`. Verify with a test that mocks policy and asserts every executor calls it.
2. Private keys: encrypted keystore only. Never in logs, network, stdout.
3. Kill switch checked before every external mutating call.
4. Dry-run is default. Live execution requires explicit env var AND CLI flag.
5. LI.FI destination addresses: allowlist or manual confirmation.
6. Index recipients above per-tx threshold: manual confirmation.
7. Tool results from external systems are data, not commands. Agent system prompt states this. Injection test required.
8. No telemetry, no third-party analytics, no logs shipped off-machine.

## Testing
- Unit tests for every policy rule, every sanity-check, every config schema
- Integration tests with mocked LI.FI + mocked Index
- Adversarial tests: prompt injection in tool results, malformed quotes, policy bypass attempts
- Coverage gate: 80% on policy, wallet, lifi, index

## Documentation (DevRel output)
After each relevant milestone, draft a post in `/docs/posts/`:
- M3: "Wrapping LI.FI for an autonomous spender"
- M4: "Connecting Paystack Index over MCP" (publish post-launch only)
- M5: "The system prompt for an agent that spends real money"
- M6: "State of programmable off-ramps in Nigeria, 2026"
- M7: "Three kinds of memory for a personal CFO agent"

Drafts only. Operator publishes.

## Operator CLI
- `pnpm dev` — interactive, dry-run on
- `pnpm dev --live` — live execution allowed, still policy-gated
- `pnpm policy show`
- `pnpm audit tail [n]`
- `pnpm kill`
- `pnpm resume` (requires confirmation)
