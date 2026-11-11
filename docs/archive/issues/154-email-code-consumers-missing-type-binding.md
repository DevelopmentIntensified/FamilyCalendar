# 154 — Email-code consumers missing type binding (login/signup accept any code)

Status: done

Source: security audit (issue 136), 2026-10-06. Rank 8/15 — real type confusion but narrow reach: attacker must already hold a code emitted to some mailbox.

## Done

- **Fixed 2026-10-22 (local, uncommitted, Option A together with #162):** all email-code consumers redeem through a type+email-bound **hashed** lookup (`HashedCodeFilter` from `codes.ts`) — `login/email/code/+server.ts:77` (`type: 'login'`), `signup/email/code/+server.ts:71` (`type: 'signup'`), `signup/password/verify/+server.ts:62` (`type: 'password-signup'`). Unknown code, wrong email, and mismatched type all read as one generic 400 (no oracle). An `email_change` code can no longer log its holder in via login/signup, nor be burned by the signup consumer.
- Gates: 16/16 across the three consumer suites — `login/email/code/server.test.ts` (5), `signup/email/code/server.test.ts` (6), `signup/password/verify/server.test.ts` (5), with mismatched-type reject cases pinned in each.

- Codes table carries a `type` (`codes.ts:18-30`) but producers stamp it inconsistently: magic-link `magicLink.ts:204-211` sends **no type** (shared by login and signup flows), `account/+page.server.ts:426` `email_change`, `forgot-password/reset/+server.ts:114` `reset_used`.
- `login/email/code/+server.ts:58` — `getCode(code)` with no type filter, then mints a session for the row's email (lines 75–111). An `email_change` code (row email = the account's **old** address) therefore logs the holder in as the current account — but the code was sent to the **new** mailbox. Whoever can read the pending address (shared/compromised/typo'd mailbox) takes over the account without owning the old mailbox.
- `signup/email/code/+server.ts:30` — also no type filter; the existing-account branch deletes the code it consumed (lines 51–52), so a leaked `email_change` code can be burned by probing the signup consumer.
- `reset_used` marker rows (`used:<sha256>`, `forgot-password/reset:97-115`) are consumable by the same loose lookup in principle — not guessable in practice (64 hex chars) — noted, not exploitable.
- Contrast (correct): `account/verify-email/+page.server.ts:91` checks `type !== 'email_change'`.
- Expiry is enforced globally via `deleteDeadCodes()` before lookup (`login/email/code:56`, `signup/email/code:28`) — fine.

## Needs doing

- None (fixed via Option A; residual account-takeover path closed — see #162).
