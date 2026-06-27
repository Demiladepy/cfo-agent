---
title: "Architecture of a personal CFO agent for crypto-rich, fiat-poor operators"
status: outline
publish-after: "After demo video published"
word-target: 2000
---

# Architecture of a personal CFO agent for crypto-rich, fiat-poor operators

*Outline only — operator writes prose.*

## Hook

- I earn and hold on-chain; I spend in NGN — airtime, transfers, food delivery
- Manual bridging is where I lose money and attention; agent only makes sense if policy is centre, not the LLM

## The user (composite, Lagos-shaped)

- Stablecoin balance on Sepolia/mainnet; NGN float on Index-like commerce rail
- Wants "send mom 50k" not "swap USDC, wait, off-ramp, copy account number"
- Single operator — not multi-tenant, not a neobank

## Dual-limb architecture

```
Crypto limb:  wallet → LI.FI (route/swap)
Fiat limb:    Index MCP (transfer, airtime, bills)
Bridge:       off-ramp (optional) + FX rate service
Brain:        Claude (intent → tool calls) — optional surface
Spine:        policy.evaluate on every mutating action
```

## Policy as centre (not the model)

- LLM proposes; policy disposes — `allow | deny | confirm`
- Caps: per-tx, daily, weekly, category (airtime, offramp)
- Velocity + allowlists + kill switch file
- Audit log is the receipt book — chat is not

## Surfaces, same executor

| Surface | Role |
|---------|------|
| CLI REPL (`pnpm dev`) | Operator control, scripting, confirm approve |
| Demo UI | Recordings, kill switch demo, confirm banner |
| Chat panel | Natural language → same `executeSendNgnFlow` |
| Cron triggers | Proactive rebalance when NGN float breaches target |

## Why this matters in Lagos

- FX and rail friction is daily life — agent value is **timing** rebalance, not beating the market
- NGN commerce runs on local rails; crypto liquidity is offshore/on-chain — gap is structural
- Kill switch + confirm threshold map to "my mom won't get drained while I sleep"

## Proactive vs reactive

- M13 triggers: rebalance-check every 15 min, reflection at 23:00 local
- Boot dry-run hard rule — first cron tick never live-executes (learned paranoia)
- Reflection suggests routines; never auto-applies procedural memory

## Honest boundaries (non-goals)

- Not a trading bot — no yield, no alpha
- Not multi-user custodian
- Not chat-first — CLI + triggers are primary; chat is demo sugar

## What we didn't build

- Calendar/email triggers (SPEC later)
- Multi-chain treasury view
- Automatic procedural rule application

## Demo story for readers

- Low NGN float → LI.FI routes USDC → off-ramp tops up → Index transfer
- ₦50k send hits confirm threshold → banner → operator approve
- Sandbox badge when any layer mocked — honest status API

## CTA

- Repo README demo section + architecture diagram
- Point to go-live checklist for operators cloning the pattern
