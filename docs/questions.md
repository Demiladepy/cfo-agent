# Open questions

Decisions the spec does not cover. Conservative defaults used until operator answers.

## Q1 — Kill switch path on Windows (M1)

**Spec says:** `/tmp/agent.kill`

**Default used:** `path.join(os.tmpdir(), 'agent.kill')` — resolves to `%TEMP%\agent.kill` on Windows, `/tmp/agent.kill` on typical Linux when `TMPDIR` is unset.

**Question:** Should we hardcode `/tmp/agent.kill` on all platforms (breaks Windows without WSL), or keep cross-platform `os.tmpdir()`?

## Q2 — Off-ramp provider (M6, Jun 2026)

**Spec originally suggested:** Yellow Card

**Issue:** `docs.yellowcard.engineering` unreachable.

**Default used:** `OFFRAMP_PROVIDER=juicyway` with Juicyway FX convert + NGN payout.

**Question:** Confirm Juicyway sandbox KYC complete and beneficiary ID for float account before first live off-ramp.

