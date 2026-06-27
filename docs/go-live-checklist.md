# Go-live checklist

What you need to turn each **simulated** layer into a **real** integration. Updated after M9–M13.

---

## 1. Index MCP

**Today:** MCP transport (`src/index/mcp.ts`) is built. Policy + idempotency + confirm bridge are real. Without credentials, mock Index returns simulated NGN float.

| Requirement | Notes |
|-------------|--------|
| `INDEX_MCP_API_KEY` | From Index operator dashboard |
| `INDEX_MCP_URL` | Streamable HTTP MCP endpoint |
| `INDEX_MCP_*_TOOL` overrides | Only if auto-discovery fails |
| `config/policy.yaml` | Allowlist recipient categories |
| Index account + float | Funded balance for transfers/airtime |
| Recipient IDs | e.g. `mom` configured in Index |
| Live mode | `LIVE_EXECUTION=true` + `pnpm dev --live` or demo with live session |

**Remaining gap:** Operator credentials from Index public launch. No code transport work needed.

---

## 2. LI.FI

**Today:** SDK adapter (`src/lifi/sdk.ts`) wraps `@lifi/sdk`. Sanity-check + policy gate are real. Without `LIFI_INTEGRATOR`, mock quotes are used.

| Requirement | Notes |
|-------------|--------|
| `LIFI_INTEGRATOR` | Register at li.fi |
| `config/lifi.yaml` | Copy from `lifi.example.yaml` |
| Wallet + Sepolia USDC/ETH | For live quotes/execute |
| Policy allowlist | Route destination addresses |
| Live execute | `LIVE_EXECUTION=true` + `--live` + funded wallet |

**Remaining gap:** Testnet/mainnet execute validation with real gas and slippage — not fully exercised in CI.

---

## 3. Wallet

**Today:** Keystore + viem are real. Demo uses real Sepolia RPC by default (`config/wallet.example.yaml` → Cloudflare gateway).

| Requirement | Notes |
|-------------|--------|
| `WALLET_PASSPHRASE` | Unlock keystore |
| `WALLET_KEYSTORE_PATH` | `./data/keystore.json` or production path |
| `config/wallet.yaml` | Reliable Sepolia RPC (keyed provider recommended) |
| Sepolia ETH + USDC | Faucet / test tokens |

**Remaining gap:** Production chain/token config beyond Sepolia demo scope.

---

## 4. Claude Agent

**Today:** `src/agent/claude.ts` ships — tool-calling loop with injection detection. Demo chat (`POST /api/chat`) and canonical send flow are wired. Without `ANTHROPIC_API_KEY`, chat is disabled and status shows `missing`.

| Requirement | Notes |
|-------------|--------|
| `ANTHROPIC_API_KEY` | Required for chat |
| `ANTHROPIC_MODEL` | Optional override |

**Remaining gap:** None for code — operator key only. CLI REPL does not expose chat (demo UI only).

---

## 5. NGN float

**Today:** `index.getNgnBalance()` reads live MCP balance tool when configured; falls back to simulated float with logged warning. Demo `/api/status` surfaces source honestly.

| Option | Notes |
|--------|--------|
| Index balance MCP tool | Preferred — set `INDEX_MCP_BALANCE_TOOL` if needed |
| Pre-fund Index | Skip off-ramp for hackathon demos |
| Off-ramp top-up | Juicyway FX + payout to float beneficiary (M9) |

**Remaining gap:** Live balance tool name discovery against real Index server.

---

## 6. Off-ramp (optional)

**Today:** Juicyway provider implemented (`src/offramp/providers/juicyway.ts`). Yellow Card stub deferred. Onramp.money not wired.

| Requirement | Notes |
|-------------|--------|
| `JUICYWAY_API_KEY` | Sandbox or production |
| `JUICYWAY_BENEFICIARY_ID` | NGN bank account for float |
| `JUICYWAY_PAYOUT_PIN` | Some production accounts |

See [`offramp-providers.md`](offramp-providers.md) for landscape.

---

## 7. Triggers (M13)

**Today:** Cron scheduler runs when `TRIGGERS_ENABLED=true`. First run after boot is always dry-run. Pause via file flag or UI/CLI.

| Requirement | Notes |
|-------------|--------|
| `TRIGGERS_ENABLED=true` | Master switch (default off) |
| `TRIGGERS_REBALANCE_CRON` | Default every 15 min |
| `REBALANCE_TARGET_NGN` | Float target for rebalance job |
| Operator review | Confirm threshold creates `pending_confirmations` |

**Remaining gap:** Unattended live rebalance with real execute — requires all upstream layers live + operator comfort with policy caps.

---

## 8. Confirm flow (M11)

**Today:** HTTP + demo UI banner + CLI `confirm list/approve`. Rebalance top-ups also use pending confirmations (M13).

No additional code gaps — ensure operators know ₦50k demo threshold triggers confirm.

---

## Priority order (operator)

1. Index MCP URL + API key + funded float
2. Reliable Sepolia RPC + wallet funding
3. `LIFI_INTEGRATOR` + live quote validation
4. `ANTHROPIC_API_KEY` for demo chat recordings
5. Juicyway if Index float is not pre-funded
6. `TRIGGERS_ENABLED=true` only after layers 1–3 are verified live

## Code gaps (actual, post M13)

| Gap | Status |
|-----|--------|
| `src/index/mcp.ts` | ✅ Built |
| `src/lifi/sdk.ts` | ✅ Built |
| `src/agent/claude.ts` | ✅ Built |
| Yellow Card off-ramp provider | Stub — docs were down at M6 |
| Onramp.money provider | Not wired |
| Calendar / email triggers | Not in scope |
| Coverage gate in CI | Not enforced |
| Live Index end-to-end in CI | Blocked on operator credentials |
