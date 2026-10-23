# 152 — Invite email/share JWT: not single-use, unbounded, doubles as sign-in

Status: done

Source: security audit (issue 136), 2026-10-06. Rank 6/15 — authorisation-semantics defect; reachable whenever a link is forwarded, shared, or leaks (one URL in browser history/logs).

## Done

- **Fixed 2026-10-22 (local, uncommitted):** join path rewired to the durable single-use `familyInviteCodes` row the JWT embeds — `(marketing)/family/invite/email/+page.server.ts:140-182` routes both account branches through `acceptInvite` (maxUses / expiry / revocation / family-size cap enforced; replayed or forwarded JWT cannot mint memberships). Existing account is joined but **never signed in** from a bearer link (`loginWithNotice(JOIN_COMPLETE)` → normal login). Password floor here is now 8, matching signup. Both mint routes rate-limited before minting: `members/add/email/+server.ts:64` (`INVITE_EMAIL_LIMIT = 10`), `members/add/email/link/+server.ts:56` (`INVITE_LINK_LIMIT = 10`).
- Gates: **19/19 green** across the three server suites — `invite/email/page.server.test.ts` (7), `members/add/email/server.test.ts` (6), `members/add/email/link/server.test.ts` (6). Drift note: the limiter tests hardcode `const limit = 10` instead of importing the constants — exporting them is a later nicety.

- Mint: `members/add/email/link/+server.ts:57-76` returns a shareable link (1-day HS256 JWT, no `jti`); `members/add/email/+server.ts:71-101` emails the same shape. Admin-gated (lines 36–41) — sender side fine.
- Consume: `src/routes/(marketing)/family/invite/email/+page.server.ts:105-133` `createAccountAndJoin` inserts `familyMembers` directly (113–118, 126–129) — **bypasses** `acceptInvite` (`families.ts:192`), so no `useCount`/`maxUses` cap, no revocation check, no single-use marker.
- One `/link` token = unlimited joins for 24h; invite revoke operates on `familyInviteCodes` rows only — JWTs live outside the DB → unrevocable until expiry.
- Double duty: existing account for the token's email → join **and** session cookie for that account (lines 111–118); new account → created + signed in (121–132). The `/link` variant is designed to be forwarded; a forwarded/leaked link yields a session as the invitee if already registered.
- Contrast (the intended pattern): password-reset uses a durable single-use marker (`forgot-password/reset/+server.ts:95-115`).
- Secondary: `members/add/email/+server.ts:93-101` send has no rate limit (admin-gated — lower). Password floor here is 6 (`invite/email:158`) vs 8 at signup (`signup/password:20`) — inconsistency.
- **Re-audit 2026-10-15 (#136, new rank 1): confirmed live** — bearer-login-as-existing-account (`family/invite/email/+page.server.ts:106-132`) is the most exploitable defect in the app. Forks above stand; owner decision still owed.

## Needs doing

- Nicety only: export the invite-limit constants and let the tests read them instead of hardcoding 10 (recorded drift note, not a defect).
