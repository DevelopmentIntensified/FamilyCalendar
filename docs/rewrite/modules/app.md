# Port sheet: app

**app** · port #23 · home: `src/lib/app/` · README after the port: [src/lib/app/README.md](../../../src/lib/app/README.md)

Composition root: builds the production Ctx, session pipeline wiring in hooks, cron cleanup, health check.

- **May import:** anything.
- **Owns tables:** none.
- **Must be ported first:** every domain and screen (from the legacy import graph; see the ledger).
- **Playbook:** [app-tasks.md](../playbooks/app-tasks.md).

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- Hook order: security headers → API origin check → session; hand-composed (no `sequence()`).
- Cross-origin `/api` mutations whose `Origin` host mismatches (or doesn't parse) → `403` with **plain-text** body `Forbidden` (not JSON). Requests without an Origin (Android, curl) pass.
- Migrations at cold start: advisory lock, tracking by file name, one transaction per file.
- Cron cleanup needs `CRON_SECRET` (Bearer or `x-cron-secret`); retention windows: anonymous 90 d, read notifications 90 d, resolved phrases/bugs 180 d, ad events 90 d.
- `/api/health`: 1-second bounded ping, no internals leaked.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/cron/cleanup` | GET (and `POST = GET`) | `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`; `CRON_SECRET` unset ⇒ always 401 | none read (no body/query) | 200 `{"success":true,"deleted":n,"scanned":n,"cutoff":"<ISO>","notificationsPruned":n,"phrasesPruned":n,"bugReportsPruned":n,"adEventsPruned":n}` | 401 `{"error":"Unauthorized"}` | `src/routes/api/cron/cleanup/+server.ts:62-80` |
| `/api/health` | GET | none — public by design, so uptime monitors can call it | none | 200 `{"ok":true,"db":"up"}` or 200 `{"ok":false,"db":"down"}`, `cache-control: no-store` | none — never 500 and never leaks internals | `src/routes/api/health/+server.ts:16-34` · test: `src/routes/api/health/server.test.ts` › "returns 200 {ok:false, db:\"down\"} — not 500, no internals — when the db is down" |

### Rules the module must keep
- Hook order is security headers → API origin check → session, composed by hand (`securityHeaders({resolve: () => apiOriginCheck({resolve: () => sessionHandle(...)})})`), not `sequence()`; `locals.ctx = appCtx` and `locals.actor = null` are set first so every handler sees them — `src/hooks.server.ts:168-183`
- Security headers on every response: `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`; no CSP here (inline scripts) — `src/hooks.server.ts:125-133`
- Origin check applies to `/api/` paths, non-GET, when the method is POST/PUT/PATCH/DELETE **or** `content-type` contains `application/json`; a present `Origin` whose parsed host differs from `event.url.host`, or that cannot be parsed, gets `403` with the plain-text body `Forbidden`; an absent `Origin` (curl, server-to-server, Android) passes — `src/hooks.server.ts:135-167`
- Bearer auth only on `/api/*`: `Authorization: Bearer <token>` is looked up by `getUserForApiToken`; unknown token → 401 `{"error":"Unauthorized"}` and the request is not resolved; valid token → `locals.user`, `locals.session = null`, actor `via: 'token'`; a Bearer header off `/api/*` is ignored — `src/hooks.server.ts:42-62` · tests: `src/hooks.server.test.ts` › "authenticates a valid Bearer token on /api/* with no session", "returns 401 JSON for an invalid Bearer token without resolving", "ignores Bearer headers off /api/* (page routes stay cookie-only)"
- Cookie path: `session.validateSession(cookieValue)`; a fresh session re-issues the cookie; an invalid cookie overwrites it with a blank one and nulls locals; no cookie nulls locals — `src/hooks.server.ts:64-70,99-107` · tests › "populates locals from a valid session cookie without re-issuing the cookie when not fresh", "cascades a blank cookie and nulls locals when the cookie is invalid"
- Anonymous Account creation happens only for a document navigation (`GET` + `Accept` contains `text/html`) on a path containing the segment `calendar`, `account`, `claim`, or `admin`; it creates the account, creates a session, sets the session cookie, and sets actor `via: 'session'` — `src/hooks.server.ts:81-95` · tests › "creates an Anonymous Account + session for a document navigation on a protected route and sets the session cookie", "does NOT create an anonymous account for non-document requests (prefetch/API)"
- Inactivity Window activity: any authenticated request whose `lastActiveAt` is older than one hour writes `touchLastActiveAt` — `src/hooks.server.ts:26,108-113`
- Admin gate: routes are matched by path **segment** (so `/disclaimer` never matches `claim`); with no cookie the admin redirect happens **before** the anonymous-account fallback; with a session, a user lacking the `admin` role is redirected — both `302 /login` — `src/hooks.server.ts:28-39,71-73,118-120` · test › "redirects admin routes to /login before any anonymous-account fallback"
- `handleError`: `status === 404` returns immediately (styled error page still renders, no stack-trace log); otherwise `console.error(error)`; unauthenticated callers (no `locals.user`) are never auto-filed; authenticated failures build `buildAutoBugReport({status, message, path, userId})`, are throttled per `area:path:message.slice(0,120)`, awaited through `createBugReport`, and the whole filing path is swallowed so it cannot break the error response — `src/hooks.server.ts:185-216` · tests › "does NOT file a bug report for an unauthenticated caller (attacker-generated, not an app signal)", "still files for an authenticated 500, keyed to the user", "throttles repeated identical authenticated failures within the window"
- `apiError(path, status, message, userId?, fileReport=createBugReport)` returns `{ error: message }` with that status; only `status >= 500` files a report (fire-and-forget through the injectable seam); 4xx never files — `src/lib/server/utils/apiError.ts:24-38` · test: `src/lib/server/utils/apiError.test.ts` › "auto-files 500s with the path area", "never files 4xx client errors"
- Migrations are kicked off at module scope on cold start, fire-and-forget, unless `DATABASE_DISABLE_MIGRATIONS` is set — `src/hooks.server.ts:19-21` (runner rules are in the kernel sheet)
- Cron cleanup windows: Inactivity Window 90 days (unclaimed Anonymous Accounts); read notifications 90 days; resolved unmatched phrases 180 days; resolved bug reports 180 days; ad events 90 days; expired claim tokens always deleted. Stale users are deleted one by one (a failure is logged and the rest continue), then the four prunes run in `Promise.all` and none gates another — `src/routes/api/cron/cleanup/+server.ts:12-59`
- The cleanup schedule is Vercel cron `0 4 * * 1` (Mondays 04:00 UTC) — `vercel.json:2-7`
- `/api/health` pings with a bare `select 1` raced against a 1000 ms rejecting timer; `_pingDb` resolves `'up' | 'down'` and never throws; GET always answers 200 with only `{ok, db}` — `src/routes/api/health/+server.ts:7-34` · tests: `src/routes/api/health/server.test.ts` › "reports down when the query hangs past the 1s timeout", "returns 200 {ok:true, db:\"up\"} when the db answers"

### Page and UI behaviour worth keeping
- Deep-linking any admin page without an admin session lands on `/login` (302) rather than a 403/error page — `src/hooks.server.ts:71-73,118-120`
- 404s (bot probes, mistyped URLs) keep SvelteKit's styled error page but skip the stack-trace log — `src/hooks.server.ts:196`
- A first-time visitor who opens a protected document URL gets a working Anonymous Account immediately, with no signup wall — `src/hooks.server.ts:84-95`
- Every page response carries the four security headers — `src/hooks.server.ts:126-133`

### Probably accidental (candidates to drop, owner to confirm)
- The origin-check rejection body is plain text `Forbidden`, not the JSON `{"error":"Forbidden"}` the sheet's Must-survive line describes — `src/hooks.server.ts:159` — any client parsing the error body as JSON breaks on this one 403
- The origin check only covers `/api/*`; cross-site HTML form actions still rely on SvelteKit's built-in check alone (ticket #016) — `src/hooks.server.ts:143-147` — the stated CSRF defense-in-depth stops at the JSON API
- Bearer auth returns `resolve(event)` before the admin gate, so a personal API token (not necessarily an admin) reaches `/api/admin/*` without the role check; the gate at `:118` only runs on the cookie path — `src/hooks.server.ts:49-61` vs `:118-120` — inconsistent authorization between the two identity modes
- Migrations are fire-and-forget at module scope, so the first request after a deploy can execute before (or while) the schema is migrated — `src/hooks.server.ts:19-21` — cold-start race the runner comment acknowledges
- Cron cleanup has no failure count: user deletions that throw are only logged, and the response still says `success: true` — `src/routes/api/cron/cleanup/+server.ts:25-32,51-59` — a scheduler cannot tell a partial run from a complete one
- `POST = GET` on `/api/cron/cleanup` (and any future alias) makes the method meaningless and silently ignores a POST body — `src/routes/api/cron/cleanup/+server.ts:80` — implementation convenience leaking into the API surface
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#016](../../archive/issues/016-security-lows.md) Widen the Origin check beyond /api/*; validate checkout finalPrice server-side. | SECURITY | keep behaviour; separate ticket |
| [#130](../../archive/issues/130-the-gate-to-master-audit-marks-and-a-definition-of-done.md) The gate to master: owner screenshot approval per page. | OWNER | owner (applies to cutover) |
| [#142](../../archive/issues/142-security-fixes.md) Every security finding fixed or waived by the owner, waiver recorded. | SECURITY | owner ledger stays; cutover checks it |
| [#143](../../archive/issues/143-the-promotion-gate.md) Written pass/fail promotion checklist + owner sign-off. | OWNER | owner (cutover) |
| [#177](../../archive/issues/177-no-backups-pitr.md) Neon PITR restore drill. | OWNER | owner |
| [#181](../../archive/issues/181-no-csp-hsts.md) CSP (nonced inline scripts) + HSTS. | SECURITY | keep; separate ticket after APP-03 |
| [#185](../../archive/issues/185-iac-rollback.md) Env parity, deploy pins commit, rollback script. | STRUCTURE | keep; separate ticket |
| [#198](../../archive/issues/198-calendar-sync-verdict-review.md) Calendar sync verdict. | OWNER | owner |
| [#199](../../archive/issues/199-group-chat-video-rework.md) Group chat/video plan rework. | OWNER | owner |

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

- Cross-module ports to wire in `src/lib/app` when their modules reach S5 ([add-a-port.md](../playbooks/add-a-port.md)): identity takes `CalendarAccessPort` and `AdConsentPort`; family takes `FamilyCalendarPort` and `MemberTasksPort`, both on the caller's transaction ctx. Each module's README › Depends on names them.

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# app: 0% ported

legacy source files left (1/1, 39 LOC):
  - src/lib/server/utils/apiError.ts (39 LOC, server) importers: 21
      NOTE: Used by ~22 legacy routes across modules. feedback S8: make it delegate to appCtx.faults.report (the feedback service) instead of building reports itself; delete it in APP-05 when the last legacy route using it is ported.

route files not yet wiring-only (2/2):
  - src/routes/api/cron/cleanup/+server.ts  /api/cron/cleanup
  - src/routes/api/health/+server.ts  /api/health

legacy test files left (2/2) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/server/utils/apiError.test.ts [pure, 4 tests]
  - src/routes/api/health/server.test.ts [route, 5 tests]
```
<!-- census:end -->
