# 151 — Email-change: unthrottled send + unthrottled, unbound verify

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 5/15 — needs any registered session (attacker registers once, cf. 147), then unbounded send + code-consumption weaknesses.

## Done

- `src/routes/(calendar)/account/+page.server.ts:354-430` — `updateEmail` has no `rateLimit` (file imports none): each POST emails a code to an arbitrary address (lines 411–417) from `NOREPLYEMAIL` → email bombing / domain reputation abuse.
- `src/routes/(calendar)/account/verify-email/+page.server.ts:41-114` — `verify` action has no rate limit either. Checked — brute force infeasible anyway: 8-digit numeric code (`account/+page.server.ts:393-394`), 15-min TTL → 10^8 space, not the issue.
- Missing identity binding: lines 82–104 check `type === 'email_change'` (line 91) but never that `existingCode.email` matches the consuming user. Any logged-in user holding a sniffed code can rewrite **their own** user row to `pendingEmail` with `emailVerified: true` (lines 100–103) — identity grab of the pending address.
- `account/+page.server.ts:419` `deleteCodesByEmail(currentUser.email)` also wipes that address's concurrent login codes (minor self-DoS).
- Contrast (fine): `login/email/code/+server.ts:43` and `forgot-password/+server.ts:53` are limited.

## Needs doing

- Option A — rate limit `updateEmail` per user+IP (e.g. 3/15min, pattern `forgot-password/+server.ts:53`) and `verify` per IP (10/15min, pattern `login/email/code/+server.ts:43`); bind code to consumer: require `existingCode.email === currentUser.email` (no schema change). Cost: legit rapid retries get 429s with clear message.
- Option B — rate limit only, defer binding. Cost: code-holder identity-grab path remains (narrow: requires reading the pending mailbox).
- Issue 154 covers the related type-confusion at the login/signup consumers.
