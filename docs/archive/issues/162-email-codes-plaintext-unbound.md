# 162 — Email codes stored plaintext, redeemed by code alone

Status: done

Source: security audit (issue 136), 2026-10-15. Rank 2/16 — pre-auth, account-takeover on DB read.

## Done

- **Fixed 2026-10-22 (local, uncommitted, Option A together with #154):** codes hashed at rest — `hashEmailCode` (sha256) in `src/lib/server/db/actions/codes.ts:15`; `getHashedCode` / `deleteHashedCode` (`codes.ts:32` / `:46`) redeem against `eq(codes.code, hashEmailCode(code))` ANDed with a bound `email` and `type` (`HashedCodeFilter`, `codes.ts:6`). A DB read no longer yields anything redeemable, and redemption is bound to the consuming email + code kind.
- Gates: the three consumer suites (`login/email/code`, `signup/email/code`, `signup/password/verify`) green — 16/16, details on #154.

- `src/lib/server/db/actions/codes.ts` — `createCode` stores the 8-digit numeric code **plaintext**; consumers (`signup/email/code/+server.ts:34-68`, `login/email/code/+server.ts:60-100`) redeem by `getCode(code)` with no email/session binding.
- DB read = account takeover for any unexpired code. Online brute force slowed only by the per-`clientKey` bucket — bypassable per issue 150.
- Contrast (correct): `claimTokens` and `apiTokens` are SHA-256 hashed at rest.
- Related: #154 (type confusion across consumers) — fixing the redeem path should bind type at the same time.

## Needs doing

- None (fixed via Option A — hash at rest + email/type binding in one redesign; the type-binding half is recorded on #154).
