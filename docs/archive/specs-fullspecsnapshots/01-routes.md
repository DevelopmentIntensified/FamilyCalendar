# 01 — Routes

Groups: `(marketing)` public · `(calendar)` app (`calendar/` + `account/`) · `(family)` · `(admin)` · top-level `/share-target`, `/report-bug`, `/api/**`.

Auth pattern: page loads 302 `/login` (guard in `+layout.server.ts`); `/api/*` returns 401 JSON (`requireUserJson`). Family writes additionally role-gated (creator/admin in that family).

## Marketing (public shell: `src/routes/(marketing)/+layout.svelte`)

| Path | Files | Load / actions |
|---|---|---|
| `/` `/about` `/features` `/contact` `/privacy` | `+page.svelte` | static |
| `/roadmap` `/changelog` | `+page.svelte` `+page.ts` | client-side data |
| `/pricing` | `+page.svelte` `+page.server.ts` | `{user?}`, prices vary logged-in |
| `/checkout` | `+page.svelte` `+page.server.ts` | view optional, `purchase` needs user |
| `/waitlist` | `+page.svelte` `+page.server.ts` | `join` public (unguarded per #089) |
| `/login`, `/signup/*` | `+page.svelte` `+page.server.ts` | `{isLoggedIn, merge flag}`; `email POST` / `callback GET` / `code POST` / `password POST` public + rate limits |
| `/forgot-password`, `/forgot-password/reset` | `+page.svelte` `+server.ts POST` | public token exchange; reset kills all sessions |
| `/family/join/[code]` | `+page.svelte` `+page.server.ts` | `verifyInviteCode(code)` preview public; join needs login |
| `/family/invite/email` | `+page.server.ts` | `?token=` ctx (302 `login?error=missing_token` if absent); `accept/decline` token-gated — **bearer-login defect #152** |

## Calendar (`src/routes/(calendar)/calendar/`; shell `+layout.svelte` + `+layout.server.ts` loads userSettings+familyId+roster once)

`dashboardView` escape hatch (#056): if `settings.defaultView==dashboard` and no `?dashboardView`/`?view`/`?date` → 302 `/calendar/dashboard`. Nav Calendar href + dashboard back-link use `?dashboardView=1`. Active highlight is pathname-only.

| Path | Load / actions |
|---|---|
| `/calendar` | userCalendar, userEvents, family scope, ads, verse, warnings, merge-check. `?quickadd=` opens NLP modal (PWA share_target lands here) |
| `/calendar/dashboard` | day agenda; back-link logic above |
| `/calendar/tasks` `/groceries` `/notifications` `/archive` `/stats` | guarded loads (fallback+warnings, never 500) |
| `/calendar/event/[id]` | single event + RSVP; `deleteEvent` |
| `/calendar/print` | print window |
| `/calendar/import` | `calendars` (empty if anon); `parse` (no write) + `commit` — preview-before-commit per #083 |
| `/calendar/settings` | `+page.server.ts` ONLY → 302 `/account#calendar` (shim; real UI in account) |
| `/calendar/setUserDefaultTimeZone` | POST |
| `/account` (own `+layout`, Navbar-only) | user, settings, calendars, memberships; `saveCalendarSettings` + notification/timezone/verse prefs |
| `/account/verify-email` | `verify` (code + token paths — gaps #151/#166) |
| `/claim` | guest-claim ctx; `request` 401-if-anon (oracle + unthrottled #148) |
| `/claim/verify/[token]` | GET redirects by outcome — **mutates on GET #163** |
| `/merge-guest` | merge via `GUEST_MERGE_COOKIE` |

## Family (`src/routes/(family)/`, own layout, 302 `/login`)

`/family` (memberships; invite-by-link creator/admin) · `/family/create` · `/family/invitations` · `/family/tasks` · `/family/[familyId]` (role, roster, invites; `removeMember`/`role/update`/revoke role-checked) · `/family/[familyId]/tasks` · `/family/[familyId]/members/add` + 4 POST routes (`email/ link/ direct/ child/`, each 401-if-anon + role checks).

## Admin (`src/routes/(admin)/`, tab shell; 302 `/login`, 302 `/calendar` if !admin)

`/admin` index · `/admin/bugs` (`getBugReportsWithReporter`, `resolve` 403-if-!admin) · `/admin/nlp` (same for unmatched phrases).

## Misc + API

- `/share-target` → 302 `/calendar?quickadd=…` (legacy wrapper; manifest points at `/calendar` directly). `/report-bug` (login; `submit` 401-if-anon).
- `/api/events` GET(range `?date`)/POST · `/api/events/bulk` POST · `/api/events/[id]` PUT/DELETE (**no owner leg #165**) · `/rsvp` GET+POST · `/ics` GET.
- `/api/family/invite` POST(admin/creator)/GET(public `?code=` lookup)/DELETE · `/api/family/join` POST · `/search` + `/member-search` GET (401 + rateLimit).
- `/api/notifications` GET/POST · `/api/groceries` GET/POST, `[id]` PATCH/DELETE, `/colours` GET/PATCH · `/api/tasks` GET/POST (`?eventId=` **leaks private #164**), `[id]` PUT/DELETE, `/completed` DELETE (keeps stats).
- `/api/parse-event` POST — **ANON ALLOWED** (zone iff logged in; paid LLM iff logged-in + 20/5min, else local-regex).
- `api/contact` public form (#149) · `/api/bug-report`, `/report-phrase` POST (401) · `/api/push` public-key GET public, subscribe/unsubscribe · `/api/meals` (parked) · `/location-search` GET · `/logout` POST→302 · `/api/cron/cleanup` Bearer `CRON_SECRET`.

## Nav / PWA

`src/lib/utils/navItems.ts` single source: 4 marketing items; 6 app destinations (Calendar `?dashboardView=1`, Dashboard, Tasks, Groceries/Shop, Alerts bell, Family); desktop filters bell, mobile shows all (#065). `+error.svelte`: 404 vs 500 branches. PWA manifest `start_url /calendar`, share_target GET; `service-worker.js` + `offline.html`.
