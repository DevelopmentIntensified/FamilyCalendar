# 174 — Email lookup is exact-match — case and +alias duplicates
Status: open
Source: production-readiness access-control audit, 2026-10-16.
## Done
- `src/lib/server/db/actions/users.ts:12-14` — getUserByEmail does exact `eq(users.email, email)`, no lowercasing, no dedupe.
- `src/routes/(marketing)/login/password/+server.ts:28` passes the raw request email to the lookup, so `User@x.com` != `user@x.com`.
- `+`-alias handling appears nowhere (grep zero hits); only the rate-limit keys lowercase (`login/password/+server.ts:24`). Signing up `A@x.com` or `A+x@x.com` creates duplicate accounts and divergent lookup paths.
## Needs doing
- Normalize at write + lookup (lowercase; decide +alias policy: strip for matching while routing keeps the original, per spec). One seam: login + signup + claim share the helper.
- Backfill/migration plan for existing duplicate rows; regression test: mixed-case signup then lowercase login resolves one row.
