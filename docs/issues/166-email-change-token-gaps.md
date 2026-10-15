# 166 — Email-change token path skips code check, uniqueness, single-use

Status: open

Source: security audit (issue 136), 2026-10-15. Rank 6/16 — token holder can replay within the 15-min window; collision with a registered email = 500.

## Done

- `src/routes/(calendar)/account/verify-email/+page.server.ts:45-80` (token path) — JWT verified but the `codes` row is never matched, never consumed (no single-use), `pendingEmail` uniqueness/ownership never checked.
- Inbox proof exists (link sent to the NEW address), so reach is narrow — but the token is replayable in-window and a collision 500s.
- Related: #151 (unthrottled send + unbound verify on the code path) — the token path is the second half.

## Needs doing

- Consume the code row on use + check `emailExists` before write. Small; regression test: replayed token rejected, colliding address fails clean.
- No fork.
