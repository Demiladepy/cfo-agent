# Personal CFO Agent

**Crypto liquidity → NGN commerce** — an experimental agent composing **LI.FI** and **Paystack Index**, with policy gates and a kill switch.

<p align="center">
  <img src="web/preview.svg" alt="Demo UI preview" width="720" />
</p>

## Demo (for recordings & social posts)

```bash
pnpm install
pnpm demo
```

Open **http://localhost:4173** — interactive dry-run UI. No API keys required for the default demo.

### Status & balances (`GET /api/status`)

The demo never fabricates wallet or Index numbers. Each balance field is shaped as:

```json
{ "value": 25, "source": "mock", "reason": "…" }
```

| `source` | Meaning |
|----------|---------|
| `live` | Read from chain RPC (wallet) or Index MCP (NGN) |
| `mock` | Simulated layer — `mockWalletRpc`, unconfigured Index, etc. |
| `unavailable` | Read attempted but failed — `value` is `null` |

**Sandbox badge** is on when *any* of: `dryRun`, `mockWalletRpc`, mock Index MCP, or mock LI.FI. It cannot show “Live” while a layer is simulated.

**Integration dots** (wallet RPC · Index MCP · LI.FI · Claude) mirror the same live / mock / unavailable semantics. Hover for detail.

Sepolia RPC defaults to Cloudflare’s public gateway in `config/wallet.example.yaml`. Swap in your own keyed endpoint for production; set `mockWalletRpc: true` in demo context only when you need offline UI.

| Scenario | What it shows |
|----------|----------------|
| Send ₦50k to mom | LI.FI routes from USDC when NGN float is low → Index transfer |
| Buy ₦2k airtime | Direct Index MCP spend through policy |

Toggle the **kill switch** to show how all money moves halt instantly.

Writeup drafts for X / LinkedIn: [`docs/posts/showcase.md`](docs/posts/showcase.md)

## Architecture (showcase focus)

```
Operator intent
    → Policy engine (caps, allowlists, audit log)
    → LI.FI (quote → sanity-check → execute)
    → Paystack Index MCP (transfer / airtime / bills)
```

Off-ramp (Juicyway) is wired but optional — not needed for the Index + LI.FI demo story.

## CLI (operator mode)

```bash
cp .env.example .env
cp config/policy.example.yaml config/policy.yaml
pnpm dev          # dry-run boot
pnpm test         # 71 tests
pnpm policy show
pnpm audit tail 10
pnpm kill         # activate kill switch
```

## Safety

- Every money move passes `policy.evaluate`
- Dry-run default; live requires `LIVE_EXECUTION=true` **and** `--live`
- Kill switch at `os.tmpdir()/agent.kill` (or `KILL_SWITCH_PATH`)
- Encrypted wallet keystore; secrets redacted in logs

## Status

M0–M8 complete. See [`SPEC.md`](SPEC.md) and [`docs/progress/`](docs/progress/).

## Environment

Copy [`.env.example`](.env.example) → `.env`. For the **demo UI**, no keys needed. For live Index:

| Variable | Demo | Live |
|----------|------|------|
| `INDEX_MCP_URL` | — | Paystack Index MCP |
| `INDEX_MCP_API_KEY` | — | Index auth |
| `ANTHROPIC_API_KEY` | — | Agent SDK (future) |

Full variable list in `.env.example`.
