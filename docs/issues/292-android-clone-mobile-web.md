# 292 — Android: make the app a clone of the website's mobile view

Status: in-progress

## L0 contract changes

Changes to the spec §3 contracts that the Android lanes must code against
(full contracts: `docs/guides/task-api-spec.md` → "App screen endpoints (#292, Lane L0)").

- **G6** rows also carry `isAd: true` (as proposed) — `color` is `#f59e0b`. `month` omitted = current month; bad `month` → `400 {"error":"Invalid month"}`.
- **G7 / G8** bad `date` → `400 {"error":"Invalid date"}`. G8 `warnings` = page load warnings + streamed-leg warnings in one list; `data` has no `warnings` key.
- **G10b** non-member (or missing family) → **404** `{"error":"Family not found"}`, not 403 — the web page's single answer (issue 064), so family ids cannot be probed. Writes to a family you are not in → 403.
- **G10a** each family also carries `createdLabel` (page field); `role` is added as proposed.
- **G10c** codes carry **no `createdAt`** (the `familyInviteCodes` table has no such column). Non-member → 404.
- **G10e** paths are `POST /api/families/{id}/members/{direct|email|email/link|child}` — the web handlers themselves; bodies/responses unchanged.
- **G11** non-member → 404; response is `{tasks, publicTasks, familyRoster, taskCategories}` as proposed.
- **G12** signup → `200 {token, user:{id,firstName,lastName,email,emailVerified:false}, emailVerification:"pending"}`. Added `POST /api/mobile/auth/reset {token, password}` (the web reset handler; `token` = the JWT in the emailed `/forgot-password/reset?token=` link). `verify-email` wrong code → `400 {"success":false,"error":"Unexpected error, please try again"}` (the web's generic message, not "Invalid code").
- **G14** `revoke-others` signs out **web sessions only**; fp_ API tokens (other phones, TaskFocus) stay valid — use `DELETE /api/me/api-tokens/{id}`. `POST /api/me/api-tokens` → `201`. `GET /api/me/notification-preferences` → `{preferences:{…4 booleans}, options:[{id,label,hint,default}]}`. `PUT /api/me/dashboard-modules` echoes the canonical `hidden` list kept.
- **G17 (new)** `.ics` import: `GET /api/import`, `POST /api/import/{preview,commit,undo}`; files as **base64 in JSON** (`files:[{name, contentBase64}]`).
- **G18 (new)** `GET /api/print?year=&month=` → the print page's month grid.
- **G19 (new)** `GET /api/admin`, `GET /api/admin/bugs`, `POST /api/admin/bugs/{id}/resolve`, `GET /api/admin/nlp`, `POST /api/admin/nlp/{id}/resolve`; Bearer non-admin → `403 {"error":"Forbidden"}`.
- All new endpoints: malformed JSON → `400 {"error":"Invalid JSON"}` (not a framework 500).

Source: owner, 2026-11-03: _"make the app a clone of the website mobile view for now. Be thorough. And follow the same style guide."_

Spec: [`docs/specs/android-mobile-clone.md`](../specs/android-mobile-clone.md)

## What the spec holds

- A token table. Every colour, type, radius, spacing, shadow, motion and icon value cites its source:

  - the #131 conformance harness property it falls under
  - `tailwind.config.js`
  - `src/lib/marketing/theme.css`
  - Tailwind 3.4.19 defaults
  - a component `file:line`

  `docs/guides/android-design-tokens.md` (#291) stays the single Kotlin mapping. It is updated, not forked.

- 14 screen sections, inventoried from the code at < 768 px (`VIEW_BREAKPOINT_PX`):
  - shell
  - Calendar (month / list / week / day, sheets, modals, quick-add, bulk)
  - Day Dashboard, Tasks, Groceries, Alerts
  - Families, Family detail, Invitations, Create / Add member, Family tasks
  - Account, Sign-in / Sign-up
  - secondary pages
- 175 numbered, testable acceptance items (`AC-*`).
- 16 server API gaps (G1–G16). These are screens whose data is reachable only through SvelteKit page loads or form actions, or through non-`/api` routes, which Bearer `fp_` tokens cannot reach. Each gap has a proposed contract.
- Six implementation lanes with exclusive file ownership:

  - L0 server APIs
  - L1 shell + theme
  - L2 calendar
  - L3 tasks
  - L4 dashboard + groceries + alerts
  - L5 family + account + auth

  One sequencing point: L1-S1a splits `AppViewModel` and lands the entry stubs.

- Seven open questions for the owner (Q1–Q7).

## Needs doing

- [ ] Owner answers Q1–Q7 (spec §5)
- [x] L0: G1–G19 server endpoints + `task-api-spec.md` (see "L0 — Done" below)
- [ ] L0 follow-ups (found, not fixed — web behaviour): `/signup/password` (and so G12 signup) answers "An account with this email already exists" — an account oracle; a password reset kills web sessions but not fp_ API tokens.
- [x] L1-S1a: split `AppViewModel` and add entry stubs. Done 2026-11-03; package map below.
- [ ] L1: shell + tokens (§1, §2.1)
- [ ] L2: Calendar (§2.2)
- [ ] L3: Tasks (§2.4)
- [ ] L4: Dashboard, Groceries, Alerts (§2.3, §2.5, §2.6)
- [ ] L5: Family, Account, Auth, secondary pages (§2.7–§2.14)
- [ ] Owner reviews screenshots at 390 dp and 320 dp (#130 gate)

## S1a package map (2026-11-03)

Root: `apps/android/app/src/main/kotlin/com/familyplanz/app/`. Tests mirror it under `src/test/kotlin/...`. A lane edits only its own rows.

| Path                                                                                                                                           | Owner | Holds                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FamilyPlanzApp.kt`                                                                                                                            | L1    | `AppModules`: one line per lane module, plus `AppModules.DEEP_LINKS`, which joins each module's `deepLinks`. Lanes never edit it.                                      |
| `AppServices.kt`                                                                                                                               | L1    | Shared edges for every module: `repository`, `tokenStore`, `auth`, `sessionHooks`, `startRoute`. Tests pass fakes here.                                                |
| `ui/FamilyPlanzHost.kt`, `ui/PhoneTab.kt`, `ui/FpComponents.kt`, `ui/FpEmptyState.kt`, `ui/NotificationAccess.kt`, `ui/theme/**`               | L1    | Host, the 6-tab bar (web order), shared components                                                                                                                     |
| `ui/nav/`                                                                                                                                      | L1    | `AppRoute` (every destination plus its web path), `AppNav`, `rememberAppNav`, `DeepLink` / `DeepLinks`, `StartRouteProvider`                                           |
| `ui/shell/`                                                                                                                                    | L1    | `SessionViewModel`, `SessionState`, `Shell`, `LocalShell`, `LocalAppModules`, `UiSnack`, `SESSION_ENDED_NOTE`, `GuestNote`, `ShellMenuButton`, `ComingSoonScreen`, `SessionModule` |
| `ui/calendar/`                                                                                                                                 | L2    | `CalendarEntry`, `CalendarModule`, `CalendarScreen` / `MonthGrid` / `Toolbar` / `ViewModel` / `Actions`, `QuickAdd*`                                                   |
| `ui/tasks/`                                                                                                                                    | L3    | `TasksEntry`, `TasksModule`, `TasksViewModel` (+ `TasksUiState`), `TaskListScreen`, `TaskRow*`, `AddTaskBar`, `TaskCreation`, `CategoryPicker`, `Focus*`, `TaskActions` |
| `ui/dashboard/`, `ui/groceries/`, `ui/alerts/`                                                                                                 | L4    | `XEntry` placeholder and `XModule`                                                                                                                                     |
| `ui/family/`, `ui/account/`                                                                                                                    | L5    | `XEntry` placeholder and `XModule`                                                                                                                                     |
| `ui/auth/`                                                                                                                                     | L5    | `SignInScreen` / `Steps` / `ViewModel`, `AuthModule`, `ForgotPasswordEntry`                                                                                            |
| `ui/secondary/{stats,archive,reportbug,importer,print}/`                                                                                       | L5    | `StatsEntry`, `ArchiveEntry`, `ReportBugEntry`, `ImportEntry`, `PrintEntry`. One `ui/secondary/SecondaryModule.kt`. The import page uses `importer`, because `import` is a Kotlin keyword. |
| `ui/admin/`                                                                                                                                    | L5    | `AdminEntry`, `AdminBugsEntry`, `AdminNlpEntry`, `AdminModule`                                                                                                         |

**Seams**

- An entry is `@Composable fun XEntry(nav: AppNav)`. It gets its ViewModel with `viewModel { LocalAppModules.current.x.someViewModel() }`.
  - The host provides a per-session `ViewModelStoreOwner`.
  - Sign-out and any 401 clear that store, so lane state never crosses sessions.
- An entry reports to the shell through `LocalShell.current`:
  - `showSnack`
  - `endSession(note)` after a 401
  - `signOut`
  - `guestNoteVisible` / `dismissGuestNote`
- A module is `class XModule(services: AppServices)`.
  - It owns its sources and its ViewModel factories.
  - Its `companion val deepLinks` lists the web path prefixes it claims. Longest prefix wins.
- To navigate: `nav.open(route, arg)`, `nav.openLink(webLink)`, and `nav.takeArg(route)`, which returns the one-shot argument (for example the reminder day).
- Start screen (owner decision):
  - When nothing explicit asked for a screen, `AppNav.applyStart(StartRouteProvider)` picks Dashboard or Calendar.
  - Until G3 `GET /api/me/settings` exists, `AppServices.startRoute` defaults to Calendar.
  - The logo going to Calendar is still to do, in L1's Navbar.
- Tests: `HostHarness(rule).launch(tab)`. `tab = null` follows `startRoute`. The harness builds `AppModules(AppServices(fakes…))`. The entry root carries the test tag `entry-<route>`.

## L0 — Done

Every endpoint shares its body with the web page it mirrors (page loaders/actions now call the extracted service; page tests unchanged and green). Route tests beside each endpoint: 401, 403/404 for other families / non-admins, validation 400s, happy-path shape, parity with the page loader where extracted.

| Gap | Endpoint(s) | Shared code | Tests |
|---|---|---|---|
| G1 | `GET /api/me` (extended) | — | `api/me/server.test.ts` |
| G2 | `GET /api/calendars` | `services/calendarData.ts` (`listCalendarsForUser`, `getFamilyCalendarInfo`) ← `/calendar` loader | `api/calendars/server.test.ts` |
| G3 | `GET/PATCH /api/me/settings` | `services/accountData.ts` (`loadAccountSettings`, `saveCalendarSettings`) ← `/account` | `api/me/settings/server.test.ts` |
| G4 | `GET /api/family/roster` | `getFamilyRoster` | `api/family/roster/server.test.ts` |
| G5 | `GET /api/tasks` `eventCalendarId` | — | `api/tasks/server.test.ts` |
| G6 | `GET /api/sponsored-events` | `calendarData.loadSponsoredEvents` ← `/calendar` | `api/sponsored-events/server.test.ts` |
| G7 | `GET /api/daily-verse` | `calendarData.loadDailyVerse` ← `/calendar` | `api/daily-verse/server.test.ts` |
| G8 | `GET /api/dashboard` | `services/dashboardData.ts` + `services/userScope.ts` ← dashboard loader + calendar layout | `api/dashboard/server.test.ts` (parity) |
| G9 | `GET /api/tasks/sections` | `services/tasksData.ts` ← `/calendar/tasks` | `api/tasks/sections/server.test.ts` (parity) |
| G10a–d | `/api/families`, `/api/families/{id}` (+ members, modules, invite-codes), `POST /api/families` | `services/familyData.ts` ← `/family`, `/family/[id]`, `/family/invitations`, `/family/create` | `api/families/*.server.test.ts`, `api/families/[id]/server.test.ts` |
| G10e | `POST /api/families/{id}/members/{direct,email,email/link,child}` | the web `members/add/*` handlers | `api/families/[id]/members/add.server.test.ts` |
| G11 | `GET /api/families/{id}/tasks` | `familyData.loadFamilyTasks` ← `/family/tasks` | `api/families/lists.server.test.ts` |
| G12 | `POST /api/mobile/auth/{signup,forgot,reset}`, `POST /api/me/verify-email(/resend)` | `services/passwordSignup.ts` ← `/signup/password`; web forgot/reset/verify/resend handlers | `api/mobile/auth/{signup,forgot}/server.test.ts` |
| G13 | `POST /api/me/claim` | `services/claimRequest.ts` ← `/claim` | `api/me/claim/server.test.ts` |
| G14 | `/api/me/{profile,email,sessions/revoke-others,api-tokens,dashboard-modules,notification-preferences,subscription}`, `DELETE /api/me` | `accountData` ← `/account` actions | `api/me/account.server.test.ts` |
| G15 | `GET /api/stats` | `services/statsData.ts` ← `/calendar/stats` | `api/stats/server.test.ts` (parity) |
| G16 | `GET /api/archive` | `services/archiveData.ts` ← `/calendar/archive` | `api/stats/server.test.ts` |
| G17 | `GET /api/import`, `POST /api/import/{preview,commit,undo}` | `services/icsImportFlow.ts` (ImportDeps seam) ← `/calendar/import` | `api/import/server.test.ts` |
| G18 | `GET /api/print` | `services/printData.ts` ← `/calendar/print` | `api/print/server.test.ts` (parity) |
| G19 | `/api/admin`, `/api/admin/{bugs,nlp}` (+ `/{id}/resolve`) | `services/adminData.ts` ← `(admin)` layout + pages | `api/admin/server.test.ts` |

No migrations. svelte-check: no errors in touched files (repo total 89 → 86).
