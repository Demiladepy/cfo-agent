# Go-live checklist

What you need to turn each **simulated** layer into a **real** integration.

---

## 1. Paystack Index MCP

**Today:** Policy + idempotency wrapper is real. MCP transport is mock only.

| Requirement | Notes |
|-------------|--------|
| `INDEX_MCP_API_KEY` | You have this |
| `INDEX_MCP_URL` | Index MCP Streamable HTTP endpoint from Paystack |
| `src/index/mcp.ts` | **Not built yet** — wire `@modelcontextprotocol/sdk` client |
| `config/policy.yaml` | Allowlist your recipient categories |
| Index account + float | Funded balance for transfers/airtime |
| Recipient IDs | e.g. `mom` configured in Index |
| Live mode | `LIVE_EXECUTION=true` + `--live` |

---

## 2. LI.FI

**Today:** Client + sanity + policy are real. SDK adapter is mock in demo.

| Requirement | Notes |
|-------------|--------|
| `src/lifi/sdk.ts` | **Not built yet** — wrap `@lifi/sdk` |
| `LIFI_INTEGRATOR` | Register at li.fi |
| `config/lifi.yaml` | Copy from `lifi.example.yaml` |
| Wallet + Sepolia USDC/ETH | For live quotes/execute |
| Policy allowlist | Add route destination addresses |

---

## 3. Wallet

**Today:** Keystore + viem are real. Demo fakes balances.

| Requirement | Notes |
|-------------|--------|
| `WALLET_PASSPHRASE` | Unlock keystore |
| `WALLET_KEYSTORE_PATH` | Generate or reuse `./data/keystore.json` |
| `config/wallet.yaml` | Reliable Sepolia RPC |
| Sepolia ETH + USDC | Faucet / test tokens |

---

## 4. Claude Agent

**Today:** Prompt + `executeSendNgnFlow` exist. No LLM loop.

| Requirement | Notes |
|-------------|--------|
| `ANTHROPIC_API_KEY` | You have this |
| `@anthropic-ai/claude-agent-sdk` | **Not installed** |
| `src/agent/claude.ts` | **Not built** — tool-calling loop |

---

## 5. NGN float

**Today:** Demo hardcodes `ngnBalanceNgn: 10_000`.

| Option | Notes |
|--------|--------|
| Index balance MCP tool | Call if Index exposes it |
| Skip for hackathon | Assume pre-funded Index float |

---

## 6. Off-ramp (optional)

Skip for hackathon. Pre-fund Index instead.

---

## Hackathon priority

1. Index MCP transport + `INDEX_MCP_URL`
2. LI.FI real quotes (execute can stay dry-run)
3. Real wallet balances from RPC
4. Claude loop (optional)

## Code gaps

| Path | Status |
|------|--------|
| `src/index/mcp.ts` | Missing |
| `src/lifi/sdk.ts` | Missing |
| `src/agent/claude.ts` | Missing |
| `src/demo/tools.ts` | Always uses mocks |
