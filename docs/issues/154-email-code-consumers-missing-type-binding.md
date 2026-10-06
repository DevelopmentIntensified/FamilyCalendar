# 154 — Email-code consumers missing type binding (login/signup accept any code)

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 8/15 — real type confusion but narrow reach: attacker must already hold a code emitted to some mailbox.

## Done

- Codes table carries a `type` (`codes.ts:18-30`) but producers stamp it inconsistently: magic-link `magicLink.ts:204-211` sends **no type** (shared by login and signup flows), `account/+page.server.ts:426` `email_change`, `forgot-password/reset/+server.ts:114` `reset_used`.
- `login/email/code/+server.ts:58` — `getCode(code)` with no type filter, then mints a session for the row's email (lines 75–111). An `email_change` code (row email = the account's **old** address) therefore logs the holder in as the current account — but the code was sent to the **new** mailbox. Whoever can read the pending address (shared/compromised/typo'd mailbox) takes over the account without owning the old mailbox.
- `signup/email/code/+server.ts:30` — also no type filter; the existing-account branch deletes the code it consumed (lines 51–52), so a leaked `email_change` code can be burned by probing the signup consumer.
- `reset_used` marker rows (`used:<sha256>`, `forgot-password/reset:97-115`) are consumable by the same loose lookup in principle — not guessable in practice (64 hex chars) — noted, not exploitable.
- Contrast (correct): `account/verify-email/+page.server.ts:91` checks `type !== 'email_change'`.
- Expiry is enforced globally via `deleteDeadCodes()` before lookup (`login/email/code:56`, `signup/email/code:28`) — fine.

## Needs doing

- Option A — stamp types at the source: add `kind` param to `magicLink.ts` code creation ('login' | 'signup'), and type-check both consumers (`login` accepts `login` only, `signup` accepts `signup` only). Cost: touches magicLink + 2 consumers; existing rows age out in 15 min so no backfill.
- Option B — accept the narrow risk (documented): possession of a pending-mailbox code already implies mailbox access. Cost: shared-mailbox takeover path stays open; signup consumer can still burn foreign codes.
