# 153 — Unauthenticated POST to page actions throws 500 and files bug reports

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 7/15 — pre-auth and trivially reachable, but impact limited to 500s + unauthenticated DB writes (no data mutation).

## Done

- SvelteKit runs page actions **without** layout `load` guards. With no session, `hooks.server.ts:56-86` leaves `locals.user = null` (anonymous accounts are only created for GET text/html navigations, lines 72–75; only admin routes redirect, lines 63–65).
- Unguarded actions dereference `locals.user.id` → TypeError → 500: `account/+page.server.ts:167, 263, 305, 335, 493`; `family/[familyId]/+page.server.ts:208` (also runs a DB read at line 203 before any auth check).
- Side effect: `hooks.server.ts:171-178` `handleError` auto-files a bug-report row per failure key, throttled 1 per path+message per 10 min (`autoBugReport.ts:10, 44-48`) → an unauthenticated caller can write rows into `bug_reports` (admin-visible) and spam logs, indefinitely.
- Contrast (correct pattern): `claim/+page.server.ts:51` `if (!locals.user) return fail(401, ...)`; all `/api/*` routes use `requireUserJson`.

## Needs doing

- Option A — one global guard in `hooks.server.ts`: POST carrying the `x-sveltekit-action` header with no valid session → 401 before `resolve`. Cost: needs an allowlist for actions that are public **by design** (`api/contact/+page.server.ts` is an unauthenticated form action); a missed allowlist entry breaks a public form.
- Option B — per-action guard helper (e.g. `requireUserAction(locals)` → `fail(401)`) applied to `account` and `family/[familyId]` actions. Cost: touches many files; future actions can regress — needs a lint/review rule to hold.
- Either way: decide whether `handleError` should file reports for unauthenticated 500s at all (they are attacker-generated, not app signals).
