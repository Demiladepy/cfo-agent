# Connecting Paystack Index over MCP

*Draft — do not publish until Paystack public launch*

## Context

Index exposes commerce primitives (airtime, bills, transfers) as MCP tools. My agent doesn't call them directly — every invocation passes through policy and idempotency first.

## Wrapper design

```
CLI / Agent → createIndexClient → policy.evaluate → idempotency check → MCP tool
```

Idempotency keys live in SQLite `facts` table. A duplicate key returns `DUPLICATE` without hitting Index.

## Test mode

For CI and local dev I use `createMockIndexMcp()` — returns synthetic references, tracks keys in memory. No Paystack credentials required.

## Confirmation flow

Transfers above `confirm_threshold_ngn` return `CONFIRM_REQUIRED` unless `onConfirmRequired` callback approves. The CLI wires this to a prompt in M5.

## Honest limitation

I haven't run this against a live Index server yet. The MCP transport layer is mocked. Real integration waits on Paystack launch + operator credentials.
