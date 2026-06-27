# Personal CFO Agent

**Crypto liquidity → NGN commerce** — an autonomous personal CFO composing **LI.FI**, **Index MCP**, and policy gates with a kill switch.

<p align="center">
  <img src="web/preview.svg" alt="Demo UI preview" width="720" />
</p>

## Demo (for recordings & social posts)

```bash
pnpm install
pnpm demo
```

Open **http://localhost:4173** — interactive dry-run UI. No API keys required for the default demo.

### What the demo requires

| Feature | Requirement |
|---------|-------------|
| Send / airtime buttons | None — uses mock Index + mock LI.FI when unconfigured |
| Real wallet balances | Sepolia RPC in `config/wallet.yaml` (Cloudflare default in example) |
| Live Index NGN float | `INDEX_MCP_URL` + `INDEX_MCP_API_KEY` |
| Live LI.FI quotes | `LIFI_INTEGRATOR` + wallet with Sepolia USDC |
| **Chat panel** | `ANTHROPIC_API_KEY` — Claude agent loop via `POST /api/chat` |
| **Triggers panel** | `TRIGGERS_ENABLED=true` in `.env`, restart demo |
| Confirm banner | Send ₦50k to mom (demo policy confirm threshold) |

### Status & balances (`GET /api/status`)

The demo never fabricates wallet or Index numbers. Each balance field is shaped as:

```json
{ "value": 25, "source": "mock", "reason": "…" }
```

| `source` | Meaning |
|----------|---------|
| `live` | Read from chain RPC (wallet) or Index MCP (NGN) |
| `mock` | Simulated layer — unconfigured integrator, etc. |
| `unavailable` | Read attempted but failed — `value` is `null` |

**Sandbox badge** is on when *any* of: `dryRun`, mock wallet RPC, mock Index MCP, or mock LI.FI. It cannot show “Live” while a layer is simulated.

**Integration dots** (wallet RPC · Index MCP · LI.FI · Claude) mirror the same live / mock / unavailable / missing semantics.

| Scenario | What it shows |
|----------|----------------|
| Send ₦50k to mom | LI.FI routes from USDC when NGN float is low → Index transfer → confirm banner |
| Buy ₦2k airtime | Direct Index MCP spend through policy |
| Chat: “send mom 50k” | Claude tool loop → same canonical flow as send button |
| Triggers | Scheduled rebalance + daily reflection (when enabled) |

Toggle the **kill switch** to show how all money moves halt instantly.

Writeup drafts: [`docs/posts/`](docs/posts/) · showcase outline: [`docs/posts/showcase.md`](docs/posts/showcase.md)

## Architecture

```
Operator intent (CLI / demo UI / chat / cron)
    → Policy engine (caps, allowlists, audit log, kill switch)
    → LI.FI (quote → sanity-check → execute)
    → Off-ramp (Juicyway — optional, tops up NGN float)
    → Index MCP (transfer / airtime / bills)
```

Off-ramp is wired but optional for the Index + LI.FI demo story — pre-fund Index float to skip it.

## CLI (operator mode)

```bash
cp .env.example .env
cp config/policy.example.yaml config/policy.yaml
pnpm dev          # interactive REPL (dry-run default)
pnpm dev --live   # REPL with live session (requires LIVE_EXECUTION=true in .env)
pnpm test         # 101 tests, 31 files
pnpm policy show
pnpm audit tail 10
pnpm kill         # activate kill switch
```

### REPL commands (`pnpm dev`)

| Command | Description |
|---------|-------------|
| `status` | Wallet balances, NGN float, policy caps, integration health |
| `send <amount> <recipient>` | Full send flow via `executeSendNgnFlow` |
| `airtime <amount> <phone>` | Index airtime purchase |
| `quote <chain> <usdc>` | LI.FI quote only (e.g. `quote sepolia 10`) |
| `policy show` | Active policy JSON |
| `audit tail [n]` | Recent audit log entries |
| `confirm list` / `confirm <id> y\|n` | Pending confirmation queue (M11) |
| `triggers status` | Scheduled jobs, last/next run, outcome (M13) |
| `triggers pause\|resume\|run <job>` | Pause file flag or force run |
| `kill` / `resume` | Kill switch toggles |
| `live on` / `live off` | Session live mode (`LIVE_EXECUTION` must be set in `.env`) |
| `help` / `exit` | Help or quit |

Dry-run is the default. `live on` enables real execution for the session only when `LIVE_EXECUTION=true` is already in the environment.

## Safety

- Every money move passes `policy.evaluate`
- Dry-run default; live requires `LIVE_EXECUTION=true` **and** `--live` (or session `live on`)
- Kill switch at `os.tmpdir()/agent.kill` (or `KILL_SWITCH_PATH`)
- Encrypted wallet keystore; secrets redacted in logs
- First trigger run after boot is always dry-run (M13 hard rule)

## Status

M0–M13 complete. See [`SPEC.md`](SPEC.md), [`docs/audit.md`](docs/audit.md), and [`docs/progress/`](docs/progress/).

**Tests:** `pnpm test` — **101 tests** across **31 files** (as of M14).

## Environment

Copy [`.env.example`](.env.example) → `.env`. For the **demo UI**, no keys needed except chat/triggers as above.

### Core & safety

| Variable | Default | Purpose |
|----------|---------|---------|
| `LIVE_EXECUTION` | `false` | Must be `true` for any live money move |
| `POLICY_PATH` | `./config/policy.yaml` | Policy caps and allowlists |
| `KILL_SWITCH_PATH` | `os.tmpdir()/agent.kill` | Emergency halt file |

### Wallet & LI.FI

| Variable | Demo | Live |
|----------|------|------|
| `WALLET_PASSPHRASE` | auto demo keystore | Unlock production keystore |
| `LIFI_INTEGRATOR` | — | Registered LI.FI integrator name |

### Index MCP (M4 / M9)

| Variable | Purpose |
|----------|---------|
| `INDEX_MCP_URL` | Streamable HTTP MCP endpoint |
| `INDEX_MCP_API_KEY` | Index auth |
| `INDEX_MCP_BALANCE_TOOL` | Optional override for NGN balance tool name |

### Off-ramp & FX (M6 / M9)

| Variable | Purpose |
|----------|---------|
| `OFFRAMP_PROVIDER` | Default `juicyway` |
| `JUICYWAY_API_KEY` | Juicyway sandbox/production key |
| `JUICYWAY_BENEFICIARY_ID` | NGN float destination account |
| `FX_FALLBACK_USD_NGN` | Fallback rate when provider quote fails (default 1500) |

### Agent (M5 — shipped)

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Powers demo chat + `runClaudeAgent` |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-4-20250514` |

### Triggers (M13)

| Variable | Default | Purpose |
|----------|---------|---------|
| `TRIGGERS_ENABLED` | `false` | Start cron scheduler on boot |
| `TRIGGERS_REBALANCE_CRON` | `*/15 * * * *` | Rebalance check schedule |
| `REBALANCE_TARGET_NGN` | `100000` | NGN float target |

Full variable list in [`.env.example`](.env.example).
