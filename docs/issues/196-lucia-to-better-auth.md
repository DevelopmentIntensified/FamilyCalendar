# 196 — Migrate sessions from lucia (archived, EOL) to Better Auth

Status: open

Source: owner question 2026-10-16 ("are we still using lucia? why haven't we moved to betterauth?") + #161 finding (`lucia@3.2.2` archived upstream, no CVE, zero maintenance). Lucia's author's successor project is Better Auth.

## Done

- Ground truth (grep, 2026-10-16): the load-bearing lucia surface is exactly one module — `src/lib/server/auth.ts:2-8` (`Lucia`, `TimeSpan`, `DrizzlePostgreSQLAdapter` over `sessions`/`users`), used by hooks for session create/validate/invalidate and by login/signup/claim/auth-helper actions.
- Trivial couplings, easily swapped: `generateId` from `'lucia'` (8 files) and `TimeSpan` (5 files). `oslo/jwt` (magic link, password reset, email-change binding) is pilcrow's separate library — not lucia — and can stay or ride along (see risks).
- Why no move happened so far: no recorded decision anywhere in docs; the Oct hardening lane (contact/claim/password/email-change throttles, code binding to consumers) worked beside lucia, not through it.
- What the move buys: a maintained upstream; MFA/2FA + passkeys + session-manager/recovery plugins out of the box (directly closes audit #176 MFA-absent and much of #169 token/session hygiene); managed option exists on Neon (`neon-auth`, Managed Better Auth) — same DB, one credential.

## Needs doing

- **Own ticketed slice, TDD, NOT an opportunistic swap.** Sequence after the dependency-advisory lane (lockfile churn).
  1. Decide self-hosted Better Auth (pkg + Neon tables) vs Neon managed (`neon-auth`). Managed is the boring default unless integration blocks; verify Neon plan supports it.
  2. Schema swap: better-auth's `user`/`session`/`account` tables per its drizzle adapter; lucia `sessions` rows carry no user data (sessions only) so historical session records can be dropped, NOT migrated — migration SQL hand-run per repo rule (sql/ + issue note, never rely only on drizzle-kit push).
  3. Call sites: `auth.ts`, hooks server validation, login/signup/claim/create-account/forgot-password/email-change/account deletion (`users.ts:53-65` deletes sessions/ subscriptions — update to better-auth's session path), cookie cutover invalidates ALL live sessions (pre-prod acceptable; note in deploy).
  4. The Oct hardening MUST survive verbatim: per-client-key rate limits (contact/claim/password/email-change), email codes bound to consumers, claim-request privacy. These live in repo code + `codes` table, not lucia — port, don't lose: each hardened path gets its existing tests re-run green after the move.
  5. Email uniqueness/password hash format: `users.passwordHash` (bcryptjs) — better-auth password account needs its own `account` table + hashing; write a one-time hash re-wrap on first login or keep bcryptjs via plugin config — decide in the ticket, prefer keeping bcryptjs hashing (crypto-agnostic to better-auth) to avoid forced password resets.
  6. `generateId`/`TimeSpan` decoupled first as a zero-risk prep commit so blocking on the migration is not needed (half-migration of lucia itself is NOT acceptable — either lucia stays fully in place or it goes).
  7. Delete the lucia deps after cutover; rerun the full auth e2e + unit gates; push test branch and watch deploy.
- Out of scope: any marketing-auth surface other than what exists; no new providers.

## Risks

- Lucia is EOL: a real session/auth bug stays unfixed forever — this is the durable argument for the move, not the CVE board (nothing currently flagged against lucia itself).
- Migration touches login for every user + DB schema — go slow, separate commits per step 1–7, manual SQL for the user to run, verified on the test deploy before prod.
