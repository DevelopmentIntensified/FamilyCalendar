# dayDashboard

**screen** — The Day Dashboard: composes events, Top-3 Priorities, Family Task Board, Kids Schedule, groceries, Daily Verse for one viewed day.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns the `/calendar/dashboard` page and its `/api/dashboard` twin: ONE composition of the viewed day (events, Top-3 Priorities, Family Task Board, Kids' Schedule, Groceries, Completed Today, Daily Verse) so the page and the Android app cannot disagree.
- Owns the card band: which Dashboard Module renders where (info band vs cards), the two-group/one-grid layout, the skeleton that holds the band's shape while data streams, and the "Couldn't load … just now" banner.
- Owns the card-level presentation rules: glance rows (all-day first, one line each) and the Kids' Schedule grouping per child.
- Does not own: any read it composes. Day events and attendance are calendar's; Top-3 ranking, the Family Task Board list, day completions and the streak are tasks'; visibility is dashboardModules'; the roster is family's; the zone and settings are identity's; groceries and the verse are their own modules. The event edit sheet is calendar's UI; the screen only opens it.
- Does not own: Meals (parked). No tables, no repo — a screen composes domain services through their `index.server.ts`.

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: the one `DashboardModel` type tree (+ `DashboardData`, `DashboardPageData`). No logic. | — (types only) |
| [index.server.ts](index.server.ts) | entry | Public server interface: `loadDayDashboard` (page load, data streamed) and `getDayDashboard` (GET /api/dashboard). | [dayDashboard.http.db.test.ts](dayDashboard.http.db.test.ts) |
| [ui/index.ts](ui/index.ts) | entry | Public component: `DayDashboardPage` (header + info band + card band). Cards stay internal. | — |
| [dayDashboard.http.db.test.ts](dayDashboard.http.db.test.ts) | test | Golden contract for `GET /api/dashboard?date=`: status, full body, skip rules, warning shape. Runs unchanged before and after the port. | itself |

## Public interface

Designed before the code (S1). The deletion test is stated per export: if deleting it only moves its body into the caller, it does not belong here.

- `index.ts`
  - `DashboardModel` — the resolved `/api/dashboard` body: `{ zone, dayISO, isToday, meId, familyId, modules, dailyVerse, taskCategories, data, warnings }`, where `data` is `DashboardData`. Cards type their props from it (`DashboardModel['data']['kidsSchedule']`), so no card owns a second wire shape (architecture review 2026-11-10 #3). Deleting it would force every card to re-declare the shape the golden pins.
  - `DashboardData` — the ten streamed legs (`userTasks`, `familyTasks`, `familyMembers`, `dayEvents`, `top3`, `glance`, `completedToday`, `kidsSchedule`, `familyGroceries`, `mineGroceries`), each typed by the owning domain's contract type. Not a copy: a field is added here only when the golden adds it.
  - `DashboardPageData` — `Omit<DashboardModel, 'data' | 'warnings'> & { data: Promise<DashboardData>; loadWarnings: string[] }`: what the page load returns while the band streams. One derivation of the model, so the page cannot drift from the API.
- `index.server.ts`
  - `loadDayDashboard` — the page's `load`: auth `user` (302 `/login`), reads settings/family/roster from `parent()` (the group layout already loaded them), starts the category read before `parent()`, returns the header and a streamed `data` promise. The one composition, so the page has no second one.
  - `getDayDashboard` — `GET /api/dashboard` as an `endpoint()`: same composition, awaits `data`, merges `loadWarnings` then the legs' warnings. Deleting it would duplicate the composition in the route, which is exactly the drift the parity rule forbids.
- `ui/index.ts`
  - `DayDashboardPage` — the whole page body (document title, day header + DayNav URLs, warning banner, info band, streamed card band). One export because the route renders one component; the seven cards are composition detail and stay internal (deleting an export that no screen or route may import fails the deletion test).

## How to test

- Whole module: `npm run test:mod -- dayDashboard` (add `--legacy` while the legacy dashboard tests remain).
- HTTP contract: `dayDashboard.http.db.test.ts` — committed mode (`beforeEach(truncateAll)`), real Postgres (`docker start familycalendar-db`), the ROUTE module imported by relative path. Covers 401, every 400 wording, the full 200 body, absent `?date=`, an impossible date, the viewer-zone read, and the module-skip case. There is no 403/404/409/429 branch on this route, so there is no golden for them.
- Pure screen rules (S3): `dayDashboard.cards.rules.test.ts` — tables for glance ordering and Kids' Schedule grouping, no setup.
- Service (S5): `dayDashboard.service.db.test.ts` — one test per leg's degrade path (`rollbackTest`, `testCtx({ db, now })`); this is where a failing leg's warning label is pinned, because a DB failure cannot be forced in a golden that forbids `vi.mock` (R9).
- UI (S7): `ui/*.svelte.test.ts` with props only; `ui/dayDashboard.state.test.ts` in node with a fake api (no DOM, no fetch).
- Fixtures (S5): `dayDashboard.fixtures.server.ts` — builders for the views above (a family day, a hidden-module day, a solo account).
- The S3–S7 files above are the S1 plan; each row gains its file when that step lands.

## Invariants

Each line is a rule read from the legacy code on 2026-11-11, with its legacy evidence and the test that will pin it (`file › test title`).

1. The page and `GET /api/dashboard` are ONE composition: the API body is the page's payload with `data` resolved, and `warnings` is the page's labels followed by the legs' labels — `src/routes/api/dashboard/+server.ts:22-35`, `src/routes/(calendar)/calendar/dashboard/+page.server.ts:14-25` · `dayDashboard.http.db.test.ts › returns the full contract for a family day, resolved, in the viewer zone`.
2. The wire is exactly ten header keys and ten `data` keys — `+server.ts:24-34`, `dashboardData.ts:376-391` · same golden (`Object.keys` assertions).
3. `?date=YYYY-MM-DD` is read in the viewer's stored zone (UTC when unset); an absent date means today, `isToday` compares zone-local days — `dashboardData.ts:93-104`, `+server.ts:16` · `dayDashboard.http.db.test.ts › reads the viewed day in the stored zone, not in UTC` and `› absent ?date= means today…`.
4. A `date` present but not ten-digit `YYYY-MM-DD` is `400 {"error":"Invalid date"}`; a well-formed but impossible date falls back to today instead of erroring — `+server.ts:16-19`, `dashboardData.ts:98-101` · `dayDashboard.http.db.test.ts › 400 {"error":"Invalid date"} …` and `› falls back to today for a well-formed but impossible date`.
5. Signed out: the page answers 302 `/login`, the API answers `401 {"error":"Unauthorized"}` (never a redirect) — `+page.server.ts:7-9`, `+server.ts:14-15` · `dayDashboard.http.db.test.ts › 401 …`; the page rule is kernel `pageHandlers.test.ts` (the screen only declares `auth: 'user'`).
6. Module visibility is the one `dashboardVisibility` answer (family master switch AND this member's hidden list; absent key = visible), and the expensive family reads are skipped when no visible module needs them — `dashboardData.ts:110-118,131,158,221,229,323`, `src/lib/dashboardModules.ts:86-166` · `dayDashboard.http.db.test.ts › skips the reads no visible module needs…`.
7. The Daily Verse is read only when its own switch and the hidden list allow it, and its own switch alone can hide it (`showDailyVerse`) — `dashboardData.ts:392-405`, `dashboardModules.ts:135-166` · rich golden (present), `› skips …` (present), `› reads the viewed day in the stored zone` (null), `› absent ?date= …` (null).
8. An event is on the viewed day when it OVERLAPS `[dayStart, nextDayStart)`; an end exactly at 00:00 does not count, an end-less/zero-length event at 00:00 does, a multi-day event appears on every day it covers — `src/lib/utils/dayOverlap.ts:17-53`, `dashboardData.ts:182-197` · `dayDashboard.http.db.test.ts › returns the full contract …` (the overnight event is absent); the multi-day per-day case stays calendar's rule test.
9. Kids' Schedule is the family events of the viewed day with at least one child (Member Type `child`) attendee whose RSVP is not declined, and each row carries the child's id — `dashboardData.ts:219-263`, `src/lib/server/db/actions/dashboard.ts:137-153` · `dayDashboard.http.db.test.ts › returns the full contract …` (`kidsSchedule`, the declined child absent).
10. The Family Task Board's payload is the family's OPEN Tasks only, newest first, with the creator's first name joined — `dashboardData.ts:352-353,378`, `queries.ts:82-118` · `dayDashboard.http.db.test.ts › returns the full contract …` (`familyTasks`, the completed Task absent).
11. TODAY the family read also returns other members' private Tasks; Q-005a moves that filter into the tasks read after S6, so the golden pins today's leak first — `queries.ts:110-118`, `docs/rewrite/questions.md` Q-005a · `dayDashboard.http.db.test.ts › returns the full contract …` (`task-diary`).
12. Top-3 Priorities ranks the open, unarchived Tasks: mine first (creator or assignee), then priority high→normal→low, then overdue→due-today→next→none, then earliest due, then title; at most three; the exact input rows — `src/lib/server/db/actions/dashboard.ts:65-103` (moves to tasks rules) · golden `top3` order; the rule itself by the tasks rules test.
13. `glance.doneToday` is the one-off Tasks completed inside the viewed day ∪ recurring check-offs recovered from completion history, newest first; `glance.openToday` is every open Task due before the day's end (no lower bound — see the sheet's owner question); `weekStreak` is the weekly streak — `dashboardData.ts:355-382`, `actions/dashboard.ts:188-236` · `dayDashboard.http.db.test.ts › returns the full contract …` (`glance`, `completedToday`).
14. Every leg degrades to its fallback and records its label, so a failing read never 500s; the banner reads `Couldn't load {labels} just now — everything else is up to date.` and the verse's label is `today's verse` — `dashboardData.ts:83-87,110-118,124-140,152-217,219-284,292-301,303-320,322-339,392-405`, `DayDashboard.svelte:93-99` · S5 `dayDashboard.service.db.test.ts` (one test per label) and S7 `ui/DayDashboardPage.svelte.test.ts › banners the failed labels …`.
15. Glance rows are one nowrap row each, all-day rows first and timed rows by start; the empty state links `Open day view →` at the VIEWED day (`/calendar?date=YYYY-MM-DD&view=day`) — `TodayGlanceCard.svelte:38-46,57,121-150` · S3 rules test + S7 `ui/TodayGlanceCard.svelte.test.ts › points the empty-day card at the viewed day`.
16. The board header counts the BOARD's open rows, not `glance.openToday`, and prints `<n> open · <n>-week streak` or `Start a streak — check off today's tasks 🔥` — `FamilyTaskBoardCard.svelte:142,184`, `DayDashboard.svelte` passes `glance.weekStreak` · S7 `ui/FamilyTaskBoardCard.svelte.test.ts › header counts every open task on the board…`.
17. Board columns are the union of the rows' owners and the family roster (viewer first, then by name), an empty column says `nothing assigned`, and a member no longer on the roster keeps a column while their Tasks are open — `FamilyTaskBoardCard.svelte:116-142,236-262`, `src/lib/utils/familyTaskGroups.ts:29-63` · S7 board tests.
18. Board quick-add: `@member` assignment, an unknown/ambiguous member blocks the create with an inline error and keeps the input, a blank category is never sent, success toasts `Added "<title>" to the family board.` — `FamilyTaskBoardCard.svelte:50-92,178-200` · S7 board tests + `ui/dayDashboard.state.test.ts`.
19. Groceries are two fixed reads (family list only when a family exists, plus the viewer's own) and are skipped entirely when the module is off; an empty card says `Nothing on the list yet.` and links to `family` when there is a family, else `mine` — `dashboardData.ts:320-337`, `GroceriesCard.svelte:16-58` · golden `familyGroceries`/`mineGroceries` + S7 `ui/GroceriesCard.svelte.test.ts › without a family it points at Mine…`.
20. Day events carry `color` and `source`: own events use the settings colour else `#fa8072`; family events are hard-coded `#e0ffff` (see the sheet's owner question) — `dashboardData.ts:179-193` · golden `dayEvents`.
21. The `data` payload carries full `userTasks` rows (own + family, completed included) that no card renders — the Android contract lists them (see the owner question) — `dashboardData.ts:377`, `docs/guides/task-api-spec.md` G8 · golden `userTasks`.
22. The header is the day's: `Day Dashboard` + `cccc, LLLL d` (with ` · today`), the shared DayNav as URLs (`?date=` ±1 day, Today the bare path), `Open Day View` → `/calendar?date=<viewed>&view=day`, `Back to Calendar` → `/calendar?dashboardView=1` when Default View is dashboard, else `/calendar` — `+page.svelte:24-30,37-66` · S7 `ui/DayDashboardPage.svelte.test.ts › names the three days it can reach, by URL`.
23. The band paints a skeleton in the SAME shape first, then the cards; a rejected stream draws `Couldn't load the dashboard.` with Retry; below 1024px it is one column, at ≥1024px one two-column grid of two `display: contents` groups with `items-stretch`, and a hidden card leaves no empty lane — `+page.svelte:69-86,132-141`, `DayDashboard.svelte:108-172` · S7 `ui/DayDashboardPage.svelte.test.ts` (skeleton, retry, layout tests).
24. A glance row opens calendar's event sheet with the family roster; saving refreshes with `invalidateAll()` — `DayDashboard.svelte:82-90,180-190` · S7 page test + `ui/dayDashboard.state.test.ts`.

## Depends on

- May import: kernel + any domain (public entries only); never another screen.
- Owns tables: none.
- Reads (join only): none.
- Calls (design; each through the domain's `index.server.ts`):
  - `identity` — the settings row (zone, verse switch/translation, hidden modules, default view) and the viewer's id.
  - `family` — the family id and the roster (the layout loads both once per request).
  - `dashboardModules` — `dashboardVisibility` and `getFamilyModuleSwitches`: the one answer for `modules` and `needs(read)`.
  - `calendar` — the viewed day's own and family events, already overlap-filtered and expanded, with the viewer's RSVP and the attendance summary; the child attendance rows for Kids' Schedule; the event sheet and its save action.
  - `tasks` — the viewer's day list (own + family rows), the Family Task Board's open rows (Q-005a filter inside), Top-3 ranking, the day's completions (one-off + recurring history), the weekly streak, the category list, and the four write actions the cards use (quick-add, toggle complete, set priority, refresh).
  - `groceries` — the open list for the family scope and for Mine.
  - `verse` — the day's Daily Verse in the viewer's translation.
- Called by: `src/routes/(calendar)/calendar/dashboard/+page.server.ts` + `+page.svelte`, `src/routes/api/dashboard/+server.ts` (both become wiring-only at S6/S7); the Android app reads the same payload through G8 (`docs/guides/task-api-spec.md`).
