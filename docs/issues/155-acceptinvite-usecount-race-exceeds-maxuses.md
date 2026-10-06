# 155 — acceptInvite use-count is read-then-write (exceeds maxUses)

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 9/15 — reachable by concurrent accepts of one invite code; window = request duration, needs timing but no privileges.

## Done

- `src/lib/server/db/actions/families.ts:168-190` — `verifyInviteCode` reads the row (171–174) and enforces `useCount >= maxUses` in app code on that snapshot (181–187).
- `families.ts:218-221` — increments with `useCount: (verification.inviteCode.useCount ?? 0) + 1`, i.e. the value read at 171, not a DB-side increment → classic lost update. Two concurrent accepts both pass 181–187, both insert membership (213–216), second write overwrites first → `useCount` under-counts and the family exceeds `maxUses`.
- Same race on the family-size cap: `canAddFamilyMember` check at 210–211 is check-then-insert with no lock/serialisation.
- Non-race paths checked — fine: expiry (`gt(expiresAt, now)` line 174), duplicate-member guard (199–206).

## Needs doing

- Option A — atomic conditional increment: `UPDATE family_invite_codes SET useCount = useCount + 1 WHERE code = ? AND (maxUses IS NULL OR useCount < maxUses)`; proceed with membership insert only if a row was affected (insert-first-with-rollback if ordering matters). Cost: small refactor of `acceptInvite` + tests for the concurrency path.
- Option B — serialise the whole accept inside a transaction with `SELECT ... FOR UPDATE` on the invite row (also closes the family-size race at 210–211). Cost: transaction wrapping + slight contention on popular invites; more test surface.
- Not choosing (issue 136).
