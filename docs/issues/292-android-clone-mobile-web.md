# 292 — Android: make the app a clone of the website's mobile view

Status: in-progress

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
- [ ] L0: G1–G16 server endpoints + `task-api-spec.md`
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
