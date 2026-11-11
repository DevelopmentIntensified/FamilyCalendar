# 147 — Password signup grants verified email and is unthrottled

Status: done

## Shipped 2026-10-15 (verify-first, Option A)

- Password signup creates `emailVerified: false` (`signup/password/+server.ts`); new users stay invisible to member search until verified.
- Kind-agnostic `issueVerificationCode` seam (`services/magicLink.ts`) — mint+send+persist shared; `issueMagicLink` is a thin wrapper, signup-email caller untouched.
- `POST /signup/password/verify` flips the flag on code proof (generic errors, idempotent, single-use codes); `POST /signup/password/resend` re-issues for the caller's own email (auth, per-user + per-IP limits).
- Client: pending signups land on the code screen; amber banner on `/calendar` with inline code + resend for users who navigated away. Password emails are code-only (POST-only endpoint, no dead link).
- Rate limits: signup 30/IP + 10/email per 5min; verify 10/IP per 15min; resend 5/user per 15min + 30/IP per 5min.
- Verify: 53/53 across 4 touched files, full suite 3568/3569 (1 pre-existing `EventRecurrenceCard` failure, fails clean-tree too), check 39/42 = baseline, build green. Review: 1 should-fix (dead emailed link → code-only email) fixed + tested; kind-less replay impossible (`consumeMagicLink` kind-mismatch).
- Smoke users left in Neon dev DB (`pwsmoke-*`, `fresh-*`, `re-pwsmoke-*` @test.com) — purge at will.

Source: security audit (issue 136), 2026-10-06. Rank 1/15 — pre-auth, single request, identity-level impact (squatting + impersonation).

## Done

- `src/routes/(marketing)/signup/password/+server.ts:36` — `createUser({ ..., emailVerified: true })` with zero proof of mailbox control; route never sends or checks anything (whole file, lines 1–53, has no `rateLimit` call).
- Unlimited account creation: same file, no rate limit → mass signups (DB + session write amplification, throwaway identities).
- `emailVerified` is the findability gate for family member search: `src/lib/server/db/actions/memberSearch.ts:104`, `src/lib/server/db/actions/families.ts:330`, `src/routes/(family)/family/create/+page.server.ts:106` — only verified users surface.
- Reach: attacker registers `victim@example.com` as a password account, flag already `true` → shows as verified in family search (impersonation), and the real victim is blocked from registering their own address (`signup/password/+server.ts:24-27` "account already exists").
- `src/lib/server/utils/createNewUser.ts:14` sets the same flag but its callers (magic-link signup code, invite-email join) prove email possession first; the password route is the unproven one. Checked — that path is fine.

## Needs doing — owner decided 2026-10-15: Option A (verify-first)

- Set `emailVerified: false` on password signup; new password users stay invisible to family member search until verified.
- Build the missing resend-verification path for password users (none exists today — confirm shape during implementation).
- Per-IP + per-email rate limiting on the route still wanted as defence-in-depth (`login/password/+server.ts:25` pattern), but it is not the fix.
