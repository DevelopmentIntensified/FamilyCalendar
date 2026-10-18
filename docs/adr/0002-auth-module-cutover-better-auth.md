# ADR-0002 — Auth module cutover: lucia → self-hosted Better Auth (#196)

Status: accepted (2026-10-16, grilling with owner)

## Context

lucia v3 is archived upstream (zero maintenance). The auth surface leaks: anonymous-swap invariant hand-copied at 4 call sites, code/token TTLs re-implemented per caller, single-use reset via a marker-row hack, replayable email-change token (#166), no email normalization (#174), six hand-rolled throttle policies. An architecture review (five candidates A–E) scoped the deepening; owner approved all five as one migration sequence.

## Decisions

1. **One sequence, sliced**: prep (id-generation decoupled from lucia) → A session module → B email tokens → D normalization → C throttle policy → E claim/merge. Per-slice commits, gates green per slice.
2. **Session semantics: sliding, not absolute** — better-auth has no absolute cap; `expiresIn = 90d`, `updateAge = 1d` (active families never expire mid-season; abandoned sessions die 90d after last use — an upgrade over today's absolute-90).
3. **Live-session cutover: wholesale invalidation accepted** (cookie-format change; test-stage only, no prod users).
4. **Passwords: keep bcrypt** via better-auth's documented `password.verify` custom hook (Clerk-migration-guide pattern, prefix-detect `$2b$`); new hashes may stay bcrypt — no forced resets.
5. **Guests: adopt better-auth's anonymous plugin model** — guests migrate to placeholder emails (`{id}@anonymous.placeholder.invalid`); upgrade-on-login becomes the plugin's `onLinkAccount`; the 4× anonymous-swap invariant dies inside better-auth. CONTEXT.md's "Anonymous Account" vocabulary is unchanged in meaning.
6. **Email tokens: `codes` table replaced wholesale** — one EmailToken module (mint/verify/consume) over better-auth's `verification` table with `storeIdentifier: "hashed"`, kind-owned TTLs, single-use as an invariant; reset marker-row hack deleted; 6× EMAILSECRET derivations → 1. Family-invite JWTs ride the same module. DROP SQL for `codes` handed to the owner per repo rule.
7. **Email normalization is OUR invariant** — better-auth has no normalization option (#4671 not_planned); normalize lowercase on every write + lookup inside the users module; DB unique index enforces; one hand-run SQL pass dedupes existing rows.
8. **Throttle policy table** owned by the auth module; in-memory per-instance impl stays (shared-store swap is a separate later ticket — #183-adjacent).
9. **MFA deferred** (#176 stays open) — tables land MFA-ready (better-auth account model), the twoFactor plugin is a later slice.
10. **Cookie name**: better-auth default (`better-auth.session_token`); old `auth_session` cookies simply die at cutover.

## Consequences

- `auth.ts` keeps its small interface (session create/validate/invalidate/blank-cookie); implementation becomes better-auth behind the drizzle adapter. The hooks cookie path gains a testable seam.
- npm additions: `better-auth@1.7.x` (+ `better-auth/svelte` client); `@lucia-auth/adapter-drizzle` and `lucia` removed after cutover; `oslo/jwt` removed when B lands (oslo/* random helpers stay via @oslojs/crypto).
- Schema: better-auth `user/session/account/verification` tables added via drizzle schema + hand-run SQL (repo rule); `users` maps via `additionalFields`/model options; password moves from `users.passwordHash` to `account.password`.
- `requireUser`/`requireUserJson` guards remain the caller-side interface into `event.locals`.
