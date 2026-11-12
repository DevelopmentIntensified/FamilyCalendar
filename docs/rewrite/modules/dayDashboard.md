# Port sheet: dayDashboard

**screen** · port #21 · home: `src/lib/screens/dayDashboard/` · README after the port: `src/lib/screens/dayDashboard/README.md` (written in S1)

The Day Dashboard: composes events, Top-3 Priorities, Family Task Board, Kids Schedule, groceries, Daily Verse.

- **May import:** kernel + any domain (public entries); never another screen.
- **Owns tables:** none.
- **Must be ported first:** identity, dashboardModules, calendar, tasks, groceries, verse (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `6e7ab08`
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

### Files (S3–S7)

- `dayDashboard.contract.ts` — `DashboardDayQuery`: `date` optional and **regex-only** `^\d{4}-\d{2}-\d{2}$`, rejecting everything else with `Invalid date` (NOT kernel `isoDate`, which also calendar-validates and would 400 the impossible date the golden pins as a 200 today-fallback; that fallback lives in the service). Plus the wire types `DashboardModel` / `DashboardData` / `DashboardPageData`, built from each owning domain's contract type (`Task`, `Event`, `FamilyMember`, `DailyVerse`, `ModuleSwitchMap`). It is the type the golden pins; no logic, no hand-mirrored rows.
- `dayDashboard.cards.rules.ts` + `dayDashboard.cards.rules.test.ts` — the two card rules no domain owns: `orderGlanceEvents` (all-day rows first, then by start) and `groupKidsSchedule` (one group per child in first-event order; an event shared by two children appears under both; initials from the name). Pure tables.
- `dayDashboard.service.server.ts` — `loadDayDashboard(ctx, actor, { date })`: zone + day window from identity's settings, `dashboardVisibility` from dashboardModules (after its switches read), then the legs. An impossible (well-formed) date falls back to today, exactly as today. Skips per `DASHBOARD_READS.needs`; each leg recovers to its fallback and its warning label; returns the header plus a `data` promise. No SQL.
- `dayDashboard.service.db.test.ts` — one test per leg and per warning label (the only place a failing leg can be forced without `vi.mock`, rule R9), the skip matrix, the zone/day-window and `isToday` rules with `testCtx({ now })`, the verse gate.
- `dayDashboard.http.server.ts` — `loadDayDashboardPage` (`pageLoad({ auth: 'user' })`: takes settings/family/roster from `parent()`, starts the category read before it, returns header + streamed `data` + `loadWarnings`) and `getDayDashboard` (`endpoint({ method: 'GET', auth: 'user', query: DashboardDayQuery })`: awaits `data`, merges `loadWarnings` then the legs' warnings in the legacy order). Exported from `index.server.ts`.
- `dayDashboard.fixtures.server.ts` — builders: a family day, a hidden-module/switch-off day, a solo account, a Chicago-zone account.
- `ui/index.ts` — export `DayDashboardPage` only.
- `ui/DayDashboardPage.svelte` — `<svelte:head>` title, header (label · today, DayNav URLs, Open Day View, Back to Calendar), warning banner, info band, then the streamed band: skeleton grid in the final shape → cards, or the retry card. The event sheet is a `dynamic import()` on first use.
- `ui/DashboardBand.svelte` — the two-group/one-grid band; `showsModule` gates; a hidden card leaves its row instead of holding an empty lane.
- `ui/TodayGlanceCard.svelte`, `ui/TopPrioritiesCard.svelte`, `ui/CompletedTodayCard.svelte`, `ui/FamilyTaskBoardCard.svelte`, `ui/KidsScheduleCard.svelte`, `ui/GroceriesCard.svelte`, `ui/DashboardInfoBand.svelte` — props typed `DashboardModel['data'][…]`; no `fetch`, no wire copies; writes go through the state class.
- `ui/dayDashboard.state.svelte.ts` + `ui/dayDashboard.state.test.ts` — one runes class for the four card writes (quick-add, toggle complete, set priority, open/save the event sheet): optimistic rows, rollback, toasts; injected api clients and toast port, tested in node with a fake api.
- `ui/*.svelte.test.ts` — one per card plus a page test (header URLs, banner labels, skeleton shape, retry, the ≥1024 grid, hidden-module gates, the glance → sheet hand-off).

### Where each legacy export goes

| legacy | destination | why |
|---|---|---|
| `services/dashboardData.ts` `loadDashboard`, `DashboardScope` | this screen's `loadDayDashboard` | it is the composition; the SQL inside leaves |
| `actions/dashboard.ts` `rankTop3`, `RankableTask`, `RankOpts` | tasks rules (`rankTopPriorities`) | the ranking is a Task rule, not a screen rule |
| `actions/dashboard.ts` `getUserDayCalendar` / `getFamilyDayEvents` | calendar's day-events read (own / family legs) | events + their calendar are calendar's |
| `actions/dashboard.ts` `getKidsScheduleAttendance` | calendar's attendance read | attendance rows belong to events |
| `actions/dashboard.ts` `getCompletionTimestamps` | tasks (`listCompletionInstants`) | completion history is tasks' |
| `actions/dashboard.ts` `getRecurringDayCompletions` | tasks (`listDayCompletions`) | same |
| `actions/dashboard.ts` `mergeDayCompletions` | tasks rules | one-off ∪ recurring ordering is a Task rule |
| `actions/dashboard.ts` `PRIORITY_*` re-exports | tasks contract (already there) | drops the duplicate export |
| `lib/dashboardModules.ts` | dashboardModules domain | its own module |
| `components/dashboard/*.svelte` | `ui/` rebuilt on kernel/ui + state class | S7; cards type from the model |
| `components/dashboard/prototype/*` | deleted with #208 | dev-only, never on the wire |
| three route files | wiring only | R8 |

### Performance load plan — `/calendar/dashboard` (and the `/api/dashboard` twin)

- Above the fold: the header needs only the layout's scope (zone, Default View) plus the day window, so it paints without waiting on any leg.
- One `Promise.all` after the visibility answer: viewer task list, family board rows (when needed), own day events, family day events (when needed), the attendance join (Kids' on), day completions, streak, groceries (≤2 reads), verse (when on), categories (already started before `parent()`). A leg no visible module needs is never issued (`DASHBOARD_READS`).
- Streams: `data` returns as a promise; the skeleton is in the band's own grid (3 + 3 blocks) so the page does not reflow when data lands; the header and banner paint first.
- On demand: calendar's event sheet via `dynamic import()` on the first glance-row click (legacy statically imports `EventModal`, so it sits in the initial JS of this page).
- Bounded: the event window is the viewed day (±1 day pad, as today); every list is what its card renders; no per-row query.
- Legacy costs found, to remove without changing the wire:
  - `getUserDayCalendar` selects every row of the personal calendar before the ±1-day window filters (`actions/dashboard.ts:110-125`) — unbounded read.
  - `eventLeg` chains six awaits (calendar → family → expand → parse → rsvp → attendance) (`dashboardData.ts:152-217`).
  - The Kids attendance join runs after the `Promise.all`, serialized behind every other leg (`dashboardData.ts:342-353`).
  - The verse read is awaited before the loader returns, so it delays the shell, not just the band (`dashboardData.ts:397-405`).
  - `getCompletionTimestamps` reads up to 365 rows for the weekly streak (`actions/dashboard.ts:160-173`).
  - Two `syncRecurringCursors` sweeps (a SELECT + UPDATE) sit in the read path of the two task lists (`queries.ts:28,83`).
  - The payload carries full `userTasks` rows that no card renders (`dashboardData.ts:377`).
- Budget: ADR 0010 (desktop ready 300 ms, fail 1000 ms). The ready selector is the header plus skeleton; `perf:check -- dayDashboard` runs at S7.

## Notes

- 2026-11-11 (owner, [Q-005a](../questions.md)): the Family Task Board must not show other members' private Tasks. The tasks module's family read applies the filter; this screen just uses it. The S2 golden pins today's leak first (`task-diary` on the board); the wire changes only after S6 as its own `fix(dayDashboard)`/M-tasks commit.
- Architecture review 2026-11-10 #3 ([report](../../archive/review/architecture-review-2026-11-10.html)): the screen's load returns one typed `DashboardModel`, and cards type their props as `DashboardModel['…']`. No hand-mirrored wire types, no `as unknown as Event` casts.
- 2026-11-11 (S1): verified the inventory against the code. Two draft lines were imprecise and are recorded correctly in the README: the glance empty copy for a past day is `No events scheduled on this day` (`TodayGlanceCard.svelte:142`), and `glance.openToday` counts every open Task due before the day's end, overdue included (`dashboardData.ts:373-376`).
- 2026-11-11 (S1): "probably accidental" dispositions.
  - Deleted: `components/dashboard/prototype/*` (dev-only `?variant=`, never on the wire; #208 deletes it).
  - Dropped: the `getFamilyDayEvents` doc drift ("fetched regardless of visibility") — a comment; the loader gate is the behaviour and stays.
  - Dropped: `getUserDayCalendar`'s unbounded read — internal; the visible contract is the day window, and the Plan bounds it.
  - Fixed at S7: the glance row's event sheet gets `calendars={[]}` today, so its calendar picker can never list one. That is UI-only, so calendar's own sheet gets its calendar list at S7.
  - Kept as Invariants (visible on the wire) with an owner question: `glance.openToday` has no lower bound; family event colour is hard-coded `#e0ffff`; the payload's full `userTasks` rows that no card renders.
- 2026-11-11 (S2): the golden runs the real legacy route in committed mode; no `vi.mock` (R9). The route's whole chain imports no `$env`, so it runs in the `db` project. Corrected after the first verification run (TZ=UTC, production parity):
  - `tasks.dueDate` / `tasks.completedAt` are timestamptz declared `mode: 'string'`, and the wire carries the **driver's Postgres render** (`2026-11-02 08:00:00+00` — space, no `T`/`Z`), not ISO. The golden pins that render with `postgresInstant()` (accepting the server's fractional-second digits) for both task lists. `completedToday` is the exception on purpose: `dashboardData.ts` rebuilds those two instants to ISO (`new Date(row.completedAt).toISOString()` / `toIsoTimestamp`), so that card is asserted as ISO.
  - `dayEvents` rows are pinned in full — all 17 Event columns plus `masterId`, `occurrenceDate`, `date`, `color`, `source`, `rsvpStatus` and `attendance`; `created_at` is timestamp WITHOUT time zone, so it is `expect.any(String)` and never an exact instant.
  - The two "day = today" goldens (`?date=` absent, impossible date) accept both clock sources: the REAL clock on legacy and `ctx.clock` (`testCtx`'s fixed `2026-01-15T12:00:00.000Z`) after the port, so they stay green through S6.
  - `readWire` reads `res.body` (the invoke helper already parses JSON) and asserts the named `Wire` type at that boundary; no second `JSON.parse`.
  - The verse and the weekly streak are the two real-clock values in the payload: the verse is asserted by shape with its fixed `attribution`/`translation`/`fallback`, and `weekStreak` by `expect.any(Number)`.
  - Refusals on this route are only 401 and 400(`Invalid date`); there is no 403/404/409/429 branch, so no golden claims one.
  - Warning labels: a failing leg cannot be produced in the golden without mocks, so the label order (page labels first: `settings`, `today's verse`; then legs: `tasks`, `events`, `task-wins`, `streak`, `family`) is pinned at S5 in `dayDashboard.service.db.test.ts`. `groceries` has no label — it degrades silently.

### Questions for the owner

1. **`glance.openToday` has no lower bound.** Context: `openToday` counts every open Task whose due date is before the viewed day's end (`dashboardData.ts:373-376`), so long-overdue work inflates it and a past day counts its whole backlog, while the card says "today". Options: (a) keep today's wire and fix only the label; (b) bound it to `[dayStart, dayEnd)`; (c) keep the count and add a separate overdue field. Recommendation: (b), which matches the words — but it changes a G8 field, so it needs the owner and a spec bump.
2. **Family event colour is hard-coded.** Context: own events use the settings colour else `#fa8072`, family events are always `#e0ffff` (`dashboardData.ts:178-192`) even when the family has a configured colour that `GET /api/calendars` already returns. Options: (a) keep the wire; (b) send the family calendar's configured colour, falling back to `#e0ffff`. Recommendation: (b) — same field, clients already render it, and the fallback is unchanged.
3. **Full `userTasks` rows on the wire.** Context: the payload carries every own + family Task with all columns (`dashboardData.ts:377`) while no card in this module renders that list; G8 lists it as `<Task+tags>`, and TaskFocus reads task fields from other lists. Is Android reading `data.userTasks`? Options: (a) keep it (phone parity); (b) slim it to the fields the phone uses; (c) drop it. Recommendation: (a) for the rewrite, with a ticket after the phone confirms — shrinking a documented field is a wire change.
4. **`data.warnings` for groceries.** Context: the groceries leg degrades to empty lists with no label (`dashboardData.ts:320-337`), so a failed grocery read is invisible to the client while the card says "Nothing on the list yet." Options: (a) keep (a card that cannot load says nothing); (b) add a `groceries` label. Recommendation: (a) unless the owner wants the banner to name it; either way it is a wire change to the label set.

- Kept for unported importers: none. The three legacy route files are rewired at S6/S7, and the legacy dashboard tree is deleted with them at S8 (`dashboardModules.ts` is the dashboardModules module's file, not this screen's).

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
