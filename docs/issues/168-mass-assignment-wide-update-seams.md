# 168 — Mass-assignment seams accept roles/email/verified/passwordHash

Status: done

Source: security audit (issue 136), 2026-10-15. Rank 12/16 — NOT reachable today (all call sites pass safe subsets); hardening.

## Done

- `src/lib/server/db/actions/users.ts` — `updateUser(id, Partial<Omit<User,'id'>>)` accepts `roles`, `email`, `emailVerified`, `passwordHash`.
- `userSettings.ts` — `updateUserSettings` ditto for its row. All current callers pass safe subsets (verified this pass) — one future caller can mass-assign privilege.
- Fixed: `updateUser` now takes `Partial<Pick<User, 'firstName'|'lastName'>>` (caller-declared safe fields only), `updateUserSettings` the explicit 11-field preference allowlist — both filtered at runtime by `pickWritableFields` (`src/lib/server/utils/pickWritableFields.ts`) so privilege/row-key fields are dropped even if handed to the action.
- Dedicated seams for privilege writes: `verifyUserEmail(userId)` (emailVerified) and `setUserPasswordHash(userId, passwordHash)`.
- Call sites updated: `signup/password/verify/+server.ts` (deps type + call → `verifyUserEmail`), `forgot-password/reset/+server.ts` (deps type + call → `setUserPasswordHash`). `account/+page.server.ts` and `calendar/setUserDefaultTimeZone/+server.ts` needed no change — their fields are in the safe sets.
- Red→green proven: drop-privileges tests added to `users.test.ts` (email/emailVerified/passwordHash/roles) and new `userSettings.test.ts` (id/userId/updatedAt re-key sink); every touched caller suite stayed green (verify route 8, reset route 4, account page.server 8, familyId page.server 4).
