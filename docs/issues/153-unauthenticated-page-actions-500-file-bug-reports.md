# 153 — Unauthenticated POST to page actions throws 500 and files bug reports

Status: done

Source: security audit (issue 136), 2026-10-06. Rank 7/15 — pre-auth and trivially reachable, but impact limited to 500s + unauthenticated DB writes (no data mutation).

Resolution note (2026-10-23): by pick-up time, commit `1feaf71` had incidentally added `requireUser` (throws `error(401)`) to the named actions, and Kit 2.70.3 does NOT call `handleError` for `HttpError` (`utils.js:103-106` returns early) — so the 500 + bug-report spam had already stopped. What remained was wrong-shape failure (thrown error page instead of claim-style `fail(401)`) and one action (`setNotificationPreference`) swallowing the throw into `fail(500)`. Fixed with the ticket's Option B; the two closed decisions are at the bottom.

Audit-recheck of all public page actions at fix time: `(marketing)`/root public actions (`checkout`, `contact`, `waitlist`, `report-bug`, `invite/email`, `share-target`, `api/contact`) either never read `locals.user` or already guard (`checkout` returns success:false; `report-bug` redirects + fails) — no 500 surface there. Option B's "many files" cost landed capped at the two named files.

## Done

- SvelteKit runs page actions **without** layout `load` guards. With no session, `hooks.server.ts:56-86` leaves `locals.user = null` (anonymous accounts are only created for GET text/html navigations, lines 72–75; only admin routes redirect, lines 63–65).
- Unguarded actions dereference `locals.user.id` → TypeError → 500 (audit-date state): `account/+page.server.ts:167, 263, 305, 335, 493`; `family/[familyId]/+page.server.ts:208` (also ran a DB read at line 203 before any auth check).
- Side effect: `hooks.server.ts:171-178` `handleError` auto-filed a bug-report row per failure key, throttled 1 per path+message per 10 min (`autoBugReport.ts:10, 44-48`) → an unauthenticated caller could write rows into `bug_reports` (admin-visible) and spam logs, indefinitely.
- Contrast (correct pattern): `claim/+page.server.ts:51-52` `if (!locals.user) return fail(401, ...)`; all `/api/*` routes use `requireUserJson`.
- Fix (Option B): `requireUserAction(locals)` in `$lib/server/utils/requireUser.ts` — non-throwing guard returning `fail(401, { success: false, error: 'Not signed in' })`, house `requireUserJson` guard-object style. Applied auth-first to all 9 `account` actions and all 5 `family/[familyId]` actions (auth before form validation, so an unsigned POST gets 401, not 400).
- `handleError` no longer auto-files when `locals.user` is null — attacker-generated noise, not an app signal. Real failures still `console.error`; signed-in users (including Anonymous Accounts) keep full auto-filing plus the manual report channel.

## Needs doing

- CLOSED — Option B chosen: per-action guard, touching exactly the two ticket-named files plus their tests and the shared `requireUser` util. Future actions can still regress — no lint/review rule added here; new actions should use `requireUserAction`.
- CLOSED — handleError decision: no auto-filing without a session (`hooks.server.test.ts`, `handleError auto-filing (issue 153)`: no report for unsigned, authenticated filing kept, throttle honored).

