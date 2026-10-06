# 147 — Password signup grants verified email and is unthrottled

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 1/15 — pre-auth, single request, identity-level impact (squatting + impersonation).

## Done

- `src/routes/(marketing)/signup/password/+server.ts:36` — `createUser({ ..., emailVerified: true })` with zero proof of mailbox control; route never sends or checks anything (whole file, lines 1–53, has no `rateLimit` call).
- Unlimited account creation: same file, no rate limit → mass signups (DB + session write amplification, throwaway identities).
- `emailVerified` is the findability gate for family member search: `src/lib/server/db/actions/memberSearch.ts:104`, `src/lib/server/db/actions/families.ts:330`, `src/routes/(family)/family/create/+page.server.ts:106` — only verified users surface.
- Reach: attacker registers `victim@example.com` as a password account, flag already `true` → shows as verified in family search (impersonation), and the real victim is blocked from registering their own address (`signup/password/+server.ts:24-27` "account already exists").
- `src/lib/server/utils/createNewUser.ts:14` sets the same flag but its callers (magic-link signup code, invite-email join) prove email possession first; the password route is the unproven one. Checked — that path is fine.

## Needs doing

- Option A — set `emailVerified: false` on password signup and require verification before member-search findability. Cost: new password users invisible to family search until verified; needs a resend-verification path for password users (none exists today — confirm during implementation).
- Option B — keep the flag, add rate limiting (per IP + per email, e.g. `rateLimit(clientKey(request, ...), N, window)` pattern from `login/password/+server.ts:25`) plus a verification notice email. Cost: impersonation/squatting window stays open, only slowed.
- A+B combined is also viable. Not choosing here (issue 136: forks reported, not decided).
