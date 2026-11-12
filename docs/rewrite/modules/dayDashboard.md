# Port sheet: dayDashboard

**screen** · port #21 · home: `src/lib/screens/dayDashboard/` · README after the port: `src/lib/screens/dayDashboard/README.md` (written in S1)

The Day Dashboard: composes events, Top-3 Priorities, Family Task Board, Kids Schedule, groceries, Daily Verse.

- **May import:** kernel + any domain (public entries); never another screen.
- **Owns tables:** none.
- **Must be ported first:** identity, dashboardModules, calendar, tasks, groceries, verse (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `________`
- [ ] S3 contract + rules
- [ ] S4 repo (+ fixtures)
- [ ] S5 service
- [ ] S6 http + route wiring (goldens unchanged since S2)
- [ ] S7 UI rebuild (rules, api, state, components, screen) + visual check
- [ ] S8 rewire importers, delete legacy code and legacy tests
- [ ] S9 README final, census --write, gate:push, ledger done

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- Glance link opens the viewed day `/calendar?date=YYYY-MM-DD&view=day`.
- Board header counts the board's open tasks, not the glance count.
- Events overlapping the day count (an event ending exactly at 00:00 does not) (#285); Kids Schedule = events with a non-declined child attendee.
- `?date=` works for any day; module visibility via the one `dashboardVisibility` answer.
- `GET /api/dashboard?date=` shape (Android).

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface

| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/dashboard` | GET | `requireUserJson(locals)` — session user required | `?date=YYYY-MM-DD`; absent → today in the viewer's zone; present but not matching `/^\d{4}-\d{2}-\d{2}$/` → 400; a well-formed but impossible date falls back to today | 200 `{ zone, dayISO, isToday, meId, familyId, modules, dailyVerse, taskCategories, data, warnings }`, where `data` = `{ userTasks, familyTasks, familyMembers, dayEvents, top3, glance, completedToday, kidsSchedule, familyGroceries, mineGroceries }` (the page's streamed promise resolved) and `warnings` = page warnings ∪ leg warnings | 401: `Unauthorized` · 400: `Invalid date` | `src/routes/api/dashboard/+server.ts:14-35` · test: `src/routes/api/dashboard/server.test.ts` › "401 without auth" / "400 for a malformed date" / "returns the §3 contract with data resolved, for the viewed day in the user zone" |

### Rules the module must keep

- The page and `GET /api/dashboard` read through ONE loader (`loadDashboard`), so the payloads are equal once the streamed promise resolves and the warning lists merge — `src/routes/api/dashboard/+server.ts:22-35` · `dashboardData.ts:341-404` · test: `server.test.ts` › "parity: same data as the /calendar/dashboard page loader"
- The viewed day is `?date=` parsed in the viewer's zone; absent or invalid → today. `isToday` compares zone-local days, and the page parses `dayISO` in the user's zone (never process-local) — `dashboardData.ts:95-104` · `dashboard/+page.svelte:22` (no test pins the zone read; `page.ssr.test.ts` only pins that two renders do not leak context)
- Module visibility is the one `dashboardVisibility` answer (family master switch AND this member's hidden list); an absent key is VISIBLE, and expensive legs (family tasks, family day events, roster, kids attendance, groceries, verse) are skipped when nothing needs them — `dashboardData.ts:106-116,128-134,158,221,323-330,395-397` · `DayDashboard.svelte:74-78,104,122,152` · test: `DayDashboard.svelte.test.ts` › "renders the whole band when no visibility map is supplied at all"
- Top-3 ranks open, unarchived Tasks: mine-first (creator or assignee), then priority high→normal→low, then overdue→due-today→next→no-due, then earliest due, then title; at most 3; returns the input rows by reference — `actions/dashboard.ts:60-100` · test: `dashboard.test.ts` › "leads with the viewer's own tasks even when lower priority than the family's" / "caps the result at three"
- The Family Task Board lists every open family Task, grouped by assignee and falling back to the creator when unassigned; its header counts the board's own open rows, not `glance.openToday` — `dashboardData.ts:352,378` · `FamilyTaskBoardCard.svelte:116-142,184` · test: `FamilyTaskBoardCard.svelte.test.ts` › "header counts every open task on the board, not the viewer's due-today"
- The board's columns are the union of the row owners and the family roster (viewer first, then by name), empty columns say "nothing assigned", and a member no longer on the roster keeps a column if their Tasks are still open — `FamilyTaskBoardCard.svelte:116-142,254-262` · tests "gives a member with nothing assigned a column that says so" / "keeps a column for somebody who is no longer in the roster"
- An event is on the viewed day when it OVERLAPS `[dayStart, nextDayStart)`; an end exactly at 00:00 does not count, a point/end-less event at 00:00 does, and a multi-day event appears on every day it covers — `dayOverlap.ts:20-52` · `dashboardData.ts:182-197` · test: `dayOverlap.test.ts` › "drops an event ending exactly at the viewed day 00:00 (end is exclusive)"
- Kids Schedule = family events on the viewed day with at least one child attendee (Member Type `child`) whose RSVP is not declined; the child's id rides along so the card groups and colours per child — `dashboardData.ts:220-262` · `actions/dashboard.ts:140-152` · tests: `KidsScheduleCard.svelte.test.ts` › "repeats a shared event under every child attending it"
- `glance.doneToday` = one-off Tasks completed inside the day ∪ recurring check-offs recovered from completion history, newest first; `glance.openToday` = open Tasks due before the day ends; `glance.weekStreak` = the current weekly streak — `dashboardData.ts:355-382` · `actions/dashboard.ts:167-235` · test: `CompletedTodayCard.svelte.test.ts` › "lists completed tasks with their times and a win count"
- The Daily Verse is read only when visibility needs it and is rendered in the info band above the cards, gated by `showsModule(modules, 'verse')` — `dashboardData.ts:392-400` · `DayDashboard.svelte:100-106` · test: `DayDashboard.svelte.test.ts` › "a saved hidden state keeps the verse away"
- Groceries are two fixed reads (family list only when a family exists, plus the viewer's own); an empty card says "Nothing on the list yet." and still links to the right scope (`family` when there is a family, else `mine`) — `dashboardData.ts:325-340` · `GroceriesCard.svelte:20-32,52-58` · test: "without a family it points at Mine, not at a list that cannot exist"
- Every leg degrades to its fallback and records a label; the card band renders `Couldn't load {labels} just now — everything else is up to date.` and never 500s — `dashboardData.ts:106-108,387-389` · `DayDashboard.svelte:92-100`
- No session on the page redirects 302 to `/login`; the API answers 401 instead of redirecting — `dashboard/+page.server.ts:7-9` · `+server.ts:15-16`

### Page and UI behaviour worth keeping

- Header: `Day Dashboard` + `cccc, LLLL d` (with ` · today`), the shared DayNav as URLs — previous/next `/calendar/dashboard?date=…`, Today the bare `/calendar/dashboard` — then `Open Day View` → `/calendar?date=<viewed day>&view=day` and `Back to Calendar` → `/calendar?dashboardView=1` when the user's Default View is dashboard, else `/calendar` — `dashboard/+page.svelte:37-66` · `page.svelte.test.ts` › "names the three days it can reach, by URL"
- The streamed shell paints first: a skeleton in the same two-group/2-column grid, then the cards; a rejected stream draws `Couldn't load the dashboard.` with Retry — `dashboard/+page.svelte:69-86,132-141` · `page.ssr.test.ts` › "renders the streamed (pending) shell with the nav chrome"
- Band layout: info band (verse) above the cards; below 1024px one column with the day group pairing at `md`; at ≥1024px one two-column grid where both groups are `display: contents` and rows share one height (`items-stretch`); a hidden card leaves its row, never an empty lane — `DayDashboard.svelte:108-172` · tests "flows six cards through a two-column grid at ≥1024px" / "a hidden card leaves its row; the row itself never goes empty"
- Glance card: title "Today at a Glance" / "Day at a Glance"; exactly one nowrap row per event — time, kind mark, truncating title, `Family` pill, RSVP badge, attendance — with all-day rows first and the location on the tooltip; empty state `No events scheduled today` / `… on this day` + `Open day view →` pointing at the VIEWED day — `TodayGlanceCard.svelte:39-44,60-150` · `page.svelte.test.ts` › "points the empty-day card at the viewed day"
- Top-3 card: numbered rows continue across the `One-off` then `Recurring` groups (labels only when non-empty); 44px priority chips; `Family`/`Public`/`Private` scope pills; `→ Name` when assigned to someone else; the complete circle toggles (recurring gets only the streak+Undo toast, one-off toasts `"<title>" marked done.`); a priority change toasts `Priority for "<title>" set to High.`; empty state `All clear — nothing needs you right now.` + `View all tasks →` — `TopPrioritiesCard.svelte:31-45,66-118,128-150`
- Board quick-add: placeholder `Add a family task… try "saturday for Dad"`, `@member` assignment, an unknown/ambiguous `@member` blocks the create with an inline error and keeps the input, category field (suggestions, free entry, blank never sent), success toast `Added "<title>" to the family board.`; header line `<n> open · <n>-week streak` or `Start a streak — check off today's tasks 🔥`, plus `Board →` — `FamilyTaskBoardCard.svelte:50-92,178-200`
- Kids card: one band per child with initials avatar coloured from the child id, each row showing title, `All day` or start–end, and location; empty state `No kids' events today — free afternoon!` / `… this day` + `View family →` — `KidsScheduleCard.svelte:76-128`
- Groceries card: `N open`, store chips from the primary store grouping, up to three item names then `+N more`, one scope section per non-empty list with its heading linking to `/calendar/groceries?scope=family|mine` — `GroceriesCard.svelte:34-83`
- Completed card: `Completed today` / `Completed this day`, a win count with singular/plural, completion times; empty copy differs for today (`Nothing checked off yet — your wins will land here.`) vs a past day — `CompletedTodayCard.svelte:20-57`
- Info band: no card chrome, a `Daily verse` label, the reference and the optional attribution; renders nothing at all without a verse — `DashboardInfoBand.svelte:9-30` · test "carries no card chrome and no heading — it is not a band card"
- Clicking a glance row opens the edit modal with the family roster; a save refreshes via `invalidateAll()` — `DayDashboard.svelte:82-90,180-190`

### Probably accidental (candidates to drop, owner to confirm)

- The whole `dashboard/prototype/` tree (DashboardPrototype, PrototypeDock, Variant*) renders only in dev with `?variant=`, and ticket #208 says delete it with the ticket — `dashboard/+page.svelte:11-19,80-96`
- `getFamilyDayEvents`'s doc says it is "fetched whenever a family exists regardless of Dashboard Module visibility", but the loader gates it on `visibility.needs('familyDayEvents')` — comment/code drift — `actions/dashboard.ts:125-131` vs `dashboardData.ts:158`
- `getUserDayCalendar` selects every event the viewer's personal calendar holds before a ±1-day expansion window filters them — unbounded read — `actions/dashboard.ts:107-115`
- `glance.openToday` has no lower bound: it counts every open Task due before the day's end, so long-overdue work inflates it and a past viewed day counts everything due before it, while the label says "today" — `dashboardData.ts:373-376`
- Family/personal event colours are hard-coded (`#e0ffff`, `#fa8072`) instead of the calendar's configured colour — `dashboardData.ts:179-192`
- The API payload carries full `userTasks` rows that no card in this module renders — UNSURE whether an external consumer (Android) needs them — `dashboardData.ts:377` · `server.test.ts` asserts the key
- The edit modal opened from a glance row is given `calendars={[]}`, so its calendar picker can never list a calendar to move to — `DayDashboard.svelte:183-190`
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#139](../../archive/issues/139-parity-tasks-dashboard-groceries.md) Tasks/dashboard/groceries parity. | DESIGN | keep markup |
| [#208](../../archive/issues/208-dashboard-reflow-prototype.md) Dashboard reflow variant review. | OWNER | owner |

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

- 2026-11-11 (owner, [Q-005a](../questions.md)): the Family Task Board must not show other members' private Tasks. The tasks module's family read applies the filter; this screen just uses it.
- Architecture review 2026-11-10 #3 ([report](../../archive/review/architecture-review-2026-11-10.html)): the screen's load returns one typed `DashboardModel`, and cards type their props as `DashboardModel['…']`. No hand-mirrored wire types, no `as unknown as Event` casts.

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# dayDashboard: 0% ported

legacy source files left (16/16, 2922 LOC):
  - src/lib/components/dashboard/CompletedTodayCard.svelte (58 LOC, ui) importers: 3
  - src/lib/components/dashboard/DashboardInfoBand.svelte (33 LOC, ui) importers: 4
  - src/lib/components/dashboard/DayDashboard.svelte (191 LOC, ui) importers: 1
  - src/lib/components/dashboard/FamilyTaskBoardCard.svelte (300 LOC, ui) importers: 3
  - src/lib/components/dashboard/GroceriesCard.svelte (84 LOC, ui) importers: 4
  - src/lib/components/dashboard/KidsScheduleCard.svelte (129 LOC, ui) importers: 3
  - src/lib/components/dashboard/TodayGlanceCard.svelte (152 LOC, ui) importers: 5
  - src/lib/components/dashboard/TopPrioritiesCard.svelte (257 LOC, ui) importers: 3
  - src/lib/components/dashboard/prototype/DashboardPrototype.svelte (38 LOC, ui) importers: 1
  - src/lib/components/dashboard/prototype/PrototypeDock.svelte (313 LOC, ui) importers: 1
  - src/lib/components/dashboard/prototype/VariantBoardFirst.svelte (480 LOC, ui) importers: 1
  - src/lib/components/dashboard/prototype/VariantFocusFirst.svelte (93 LOC, ui) importers: 1
  - src/lib/components/dashboard/prototype/VariantMorningRead.svelte (76 LOC, ui) importers: 1
  - src/lib/components/dashboard/prototype/prototypeProps.ts (62 LOC, model) importers: 5
  - src/lib/server/db/actions/dashboard.ts (235 LOC, server) importers: 2
      NOTE: SPLIT: rankTop3/RankableTask/RankOpts -> tasks rules; getCompletionTimestamps/getRecurringDayCompletions/mergeDayCompletions -> tasks repo/service; getUserDayCalendar/getFamilyDayEvents/getKidsScheduleAttendance -> calendar repo/service; dayDashboard screen only composes.
  - src/lib/server/services/dashboardData.ts (421 LOC, server) importers: 2
      NOTE: Composition stays in dayDashboard screen; every SQL query inside moves to the owning domain's repo.

route files not yet wiring-only (3/3):
  - src/routes/(calendar)/calendar/dashboard/+page.server.ts  /calendar/dashboard
  - src/routes/(calendar)/calendar/dashboard/+page.svelte  /calendar/dashboard
  - src/routes/api/dashboard/+server.ts  /api/dashboard

legacy test files left (14/14) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/components/dashboard/CompletedTodayCard.svelte.test.ts [component, 3 tests]
  - src/lib/components/dashboard/DashboardInfoBand.svelte.test.ts [component, 6 tests]
  - src/lib/components/dashboard/DayDashboard.svelte.test.ts [component, 27 tests]
  - src/lib/components/dashboard/FamilyTaskBoardCard.svelte.test.ts [component, 16 tests]
  - src/lib/components/dashboard/GroceriesCard.svelte.test.ts [component, 11 tests]
  - src/lib/components/dashboard/KidsScheduleCard.svelte.test.ts [component, 7 tests]
  - src/lib/components/dashboard/TodayGlanceCard.svelte.test.ts [component, 12 tests]
  - src/lib/components/dashboard/TopPrioritiesCard.svelte.test.ts [component, 12 tests]
  - src/lib/server/db/actions/dashboard.db.test.ts [stub-db, 13 tests]
  - src/lib/server/db/actions/dashboard.test.ts [pure, 9 tests]
  - src/routes/(calendar)/calendar/dashboard/page.server.categories.test.ts [route, 1 tests]
  - src/routes/(calendar)/calendar/dashboard/page.ssr.test.ts [route, 3 tests]
  - src/routes/(calendar)/calendar/dashboard/page.svelte.test.ts [component, 5 tests]
  - src/routes/api/dashboard/server.test.ts [route, 4 tests]
```
<!-- census:end -->
