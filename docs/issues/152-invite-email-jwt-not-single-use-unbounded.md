# 152 — Invite email/share JWT: not single-use, unbounded, doubles as sign-in

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 6/15 — authorisation-semantics defect; reachable whenever a link is forwarded, shared, or leaks (one URL in browser history/logs).

## Done

- Mint: `members/add/email/link/+server.ts:57-76` returns a shareable link (1-day HS256 JWT, no `jti`); `members/add/email/+server.ts:71-101` emails the same shape. Admin-gated (lines 36–41) — sender side fine.
- Consume: `src/routes/(marketing)/family/invite/email/+page.server.ts:105-133` `createAccountAndJoin` inserts `familyMembers` directly (113–118, 126–129) — **bypasses** `acceptInvite` (`families.ts:192`), so no `useCount`/`maxUses` cap, no revocation check, no single-use marker.
- One `/link` token = unlimited joins for 24h; invite revoke operates on `familyInviteCodes` rows only — JWTs live outside the DB → unrevocable until expiry.
- Double duty: existing account for the token's email → join **and** session cookie for that account (lines 111–118); new account → created + signed in (121–132). The `/link` variant is designed to be forwarded; a forwarded/leaked link yields a session as the invitee if already registered.
- Contrast (the intended pattern): password-reset uses a durable single-use marker (`forgot-password/reset/+server.ts:95-115`).
- Secondary: `members/add/email/+server.ts:93-101` send has no rate limit (admin-gated — lower). Password floor here is 6 (`invite/email:158`) vs 8 at signup (`signup/password:20`) — inconsistency.

## Needs doing

- Option A — single-use + revocable: store token hash with consumed marker at accept (mirror `reset_used` pattern) and embed the invite-code id in the JWT so revocation/maxUses are enforced. Cost: one small table/column + consume-path change; share links become mint-per-guest (admin re-mints per forwarded guest — UX change).
- Option B — keep stateless 24h token but stop auto-signing-in existing accounts (require normal login to join) and record joins per token in DB to cap them. Cost: extra step for the legit invitee; token still unrevocable for its remaining lifetime.
- Also fold in: rate limit the invite send (both mint routes) regardless of option.
