# 162 — Email codes stored plaintext, redeemed by code alone

Status: open

Source: security audit (issue 136), 2026-10-15. Rank 2/16 — pre-auth, account-takeover on DB read.

## Done

- `src/lib/server/db/actions/codes.ts` — `createCode` stores the 8-digit numeric code **plaintext**; consumers (`signup/email/code/+server.ts:34-68`, `login/email/code/+server.ts:60-100`) redeem by `getCode(code)` with no email/session binding.
- DB read = account takeover for any unexpired code. Online brute force slowed only by the per-`clientKey` bucket — bypassable per issue 150.
- Contrast (correct): `claimTokens` and `apiTokens` are SHA-256 hashed at rest.
- Related: #154 (type confusion across consumers) — fixing the redeem path should bind type at the same time.

## Needs doing

- Option A — hash codes at rest (mirror the claim/API-token pattern) and bind redeem to session/email. Cost: migration of the codes table + both consumers; existing rows age out in 15 min so no backfill.
- Option B — bind redeem only (require code.email === consuming session/email), leave storage. Cost: DB-read takeover path stays open.
- Not choosing (issue 136: forks reported, not decided).
