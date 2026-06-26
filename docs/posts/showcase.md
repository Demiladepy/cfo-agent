# Showcase — X & LinkedIn

*Ready to post after you record a 30–60s screen capture of `pnpm demo`.*

---

## X (single post, ~280 chars)

Built a personal CFO agent for Nigeria: crypto-rich, NGN-poor.

When I say "send mom ₦50k" and my float is low → **LI.FI** routes liquidity → **Paystack Index** executes the transfer.

Every move passes policy caps + a kill switch. Dry-run demo 👇

[video]

#buildinpublic #fintech #web3

---

## X (thread — optional 4 tweets)

**1/4**  
Most of my wealth sits in crypto. Most of my life bills in NGN.

So I built a personal CFO agent that bridges the gap — with guardrails.

**2/4**  
Flow: check NGN float → if short, **@LIIFI_HQ** quotes & routes from USDC → **Paystack Index** (MCP) sends the transfer.

Policy engine sits in front of every tool call. Caps, allowlists, velocity limits.

**3/4**  
Safety defaults:
• Dry-run unless you explicitly opt into live
• Kill switch file stops all money moves
• Idempotency on Index calls (no double-submit)

**4/4**  
Experimental build — showcasing Index + LI.FI composition, not production-ready treasury software.

Demo UI: `pnpm demo` → localhost:4173

Repo: [link]

---

## LinkedIn

**Headline option:** I wired LI.FI and Paystack Index into a policy-gated personal CFO agent

---

**Post body:**

I keep most of my liquidity in crypto, but day-to-day life in Nigeria runs on NGN — transfers, airtime, bills.

So I built an experimental **personal CFO agent** that composes two APIs I'm excited about:

**LI.FI** for cross-chain liquidity routing (quote → sanity-check → execute)  
**Paystack Index** for NGN-side commerce over MCP (transfers, airtime, and more)

### The flow

> "Send mom ₦50,000"

1. Agent checks NGN float (₦10k in the demo)  
2. Shortfall? Route ~₦40k equivalent from USDC via LI.FI  
3. Execute the transfer through Index  
4. Every step logged to a policy audit trail  

### Why policy first

Autonomous money software needs brakes, not just accelerators. Every spend, swap, and transfer passes through:

- Per-transaction and daily caps  
- Category allowlists (family, airtime, food…)  
- Velocity limits  
- A filesystem kill switch  

Dry-run is the default. Live execution requires an explicit env flag *and* CLI confirmation.

### What this is (and isn't)

This is a **showcase build** for LI.FI × Index composition — not a trading bot, not multi-user, not production treasury infra.

Off-ramp (stablecoin → bank) is stubbed for later. The demo focuses on the two integrations that matter for the story.

### Try it

```bash
pnpm install
pnpm demo
# open http://localhost:4173
```

Short screen recording attached. Would love feedback from folks building on Index or LI.FI.

---

## Demo recording checklist

1. `pnpm demo` — wait for "demo server ready"
2. Open http://localhost:4173 (dark mode, full screen browser)
3. Click **Send ₦50k to mom** → **Run scenario**
4. Watch steps animate: balance → policy → LI.FI → Index
5. Optional: toggle **Kill switch** → run again → show block
6. Optional: **Buy ₦2k airtime** scenario
7. Trim to 30–45 seconds for X; 60–90s for LinkedIn

---

## Hashtags

**X:** `#buildinpublic` `#fintech` `#web3` `#Paystack`  
**LinkedIn:** `#Fintech` `#APIs` `#DeveloperTools` `#Nigeria` `#Web3`

Tag when appropriate: @LIIFI_HQ, Paystack / Index team accounts.
