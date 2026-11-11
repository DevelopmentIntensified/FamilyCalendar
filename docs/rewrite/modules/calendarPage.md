# Port sheet: calendarPage

**screen** · port #22 · home: `src/lib/screens/calendarPage/` · README after the port: `src/lib/screens/calendarPage/README.md` (written in S1)

The main calendar page: month/week/day/list views, toolbar and filters, selection + bulk edit, create-anything modal.

- **May import:** kernel + any domain (public entries); never another screen.
- **Owns tables:** none.
- **Must be ported first:** dashboardModules, calendar, tasks, verse, sponsored (from the legacy import graph; see the ledger).
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

- `dashboardView` escape hatch (#056): `defaultView=dashboard` redirects unless `?dashboardView`, `?view` or `?date` is present.
- `?quickadd=` seeds the NLP modal (PWA share target lands here).
- Month-window fetch + bounded loaded-months cache (#082/#201).
- Below 768px a date tap opens the day sheet; above it, or in Selection mode, it opens Day View (#205).
- Chip vocabulary: shape carries the kind, colour carries the calendar; the key renders from the same vocabulary.
- Hidden calendars/assignees are device preferences per user.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface

| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| none | — | — | — | — | — | The module owns no `src/routes/api/**` route (census). It *calls* `/api/events?from&to` (`+page.svelte:47`), `/api/report-phrase` (`:148`), `/api/events/bulk` (`:197`,`:253`), `/api/events/[id]` DELETE (`:473`) and PUT (`DayView.svelte:126`, `WeekView.svelte:144`) — all owned by other modules |

### Rules the module must keep

- `defaultView=dashboard` redirects `/calendar` → `/calendar/dashboard` unless `?dashboardView`, `?view` or `?date` is present — `src/routes/(calendar)/calendar/+page.server.ts:87-93` (not pinned in this module; the nav link is: `src/lib/utils/navItems.test.ts` › "matches query-carrying hrefs pathname-only (#056)")
- The load covers ONE month-grid window (`?date=` or today), not ±2 years — `+page.server.ts:39-41` · `eventDisplayService.ts:53`
- Other months are fetched via `loadRange` (`GET /api/events?from=…&to=…`) and merged; page-load rows win on a duplicate occurrence key — `+page.svelte:44-61` · `Calendar.svelte:289-303` · test: `Calendar.svelte.test.ts` › "merges the fetched month without duplicating what the page load already had"
- Fetched-month cache is bounded at 12 (oldest evicted and refetchable); a refetch replaces a month wholesale; fetches from before `invalidateAll()` are discarded — `Calendar.svelte:195-246` · test "evicts the oldest month once twelve are held, and refetches it"
- A failed month load is marked attempted (no hot retry) and toasted `Couldn't load that month's events — try again.` — `Calendar.svelte:262-272` · test "says so in a toast when a month fails to load"
- Opening-view order: valid `?view=` › width < 768px → `month` › last-used view › `defaultView` setting › `month`; an unmeasurable width counts as wide — `calendarView.ts:66-92` · test: `calendarView.test.ts` › "a link beats the width" / "a narrow screen opens on month, whatever was used last (#119)"
- Month-cell tap forks on width + Selection mode: below 768px the day action sheet; at/above, or in Selection mode, Day View — `MonthDays.svelte:120-129` · test: `MonthDays.svelte.test.ts` › "below the floor the mobile sheet owns the tap (openDay untouched)" / "above the floor a desktop tap opens Day View and never the sheet"
- One filter rung above every view: hidden calendars → search → hidden people; each narrows the last, and due Tasks ride the same predicates through their `calendarId` — `Calendar.svelte:386-392` · test: `calendarVisibility.test.ts` › "applies to due tasks the same way"
- Calendar and person filters are device-local reading preferences keyed per user (`familyplanz:hiddenCalendars:<id>`, `familyplanz:hiddenAssignees:<id>`); junk/absent storage means nothing hidden; hiding never writes `defaultCalendarId` — `calendarVisibility.ts:30-96` · `calendarAssignees.ts:230-276` · test "leaves the default-calendar setting alone"
- A row with no calendar is a sponsored event: no calendar or person filter may drop it (hide-all never hides an ad) — `calendarVisibility.ts:79-83` · `calendarAssignees.ts:90-104` · test "keeps an event that belongs to no calendar (an ad)"
- Person-filter rows = the loaded family roster ∪ everyone with rows; viewer first and named "You"; counts read the already-filtered rows, so a 0 is why the grid is empty — `calendarAssignees.ts:170-215` · test "lists a family member with nothing in this window, and says 0"
- Search is a reading filter, never persisted: every typed word must appear in title, description or location (AND); an empty query keeps everything — `calendarSearch.ts:33-49` · test "takes several words, and every one of them has to match"
- Selection mode: chips toggle instead of opening; Escape leaves it only when no modal is open; a drag inside it asks before leaving — `+page.svelte:175-179` · `DayView.svelte:103-108` · test: `ExitSelectionAsk.svelte.test.ts` › "fires onExit and onStay"
- Bulk posts `{ ids: [{ id }], op }`; delete is a two-step inline confirm (no `window.confirm`); smart mode is dry-run → review list → apply, and a plan moving events into the past needs "Apply anyway"; server `error` is shown verbatim, default `Hmm, that didn't take. Try again.` — `+page.svelte:190-296` · `BulkEditBar.svelte:118-160` · test "arms the delete confirm instead of deleting directly"
- Deep links, read once: `?date=YYYY-MM-DD` seeds the date store, `?view=` the view, `?edit=<id>` opens the edit modal when rows land (else an "Event not found" banner), `?quickadd=` / share-target params open the create modal pre-parsed in Quick Add and then strip the params — `+page.svelte:93-107,333-356,508-521`
- `/share-target` 302s to `/calendar?quickadd=<text||title + url>` — `src/routes/share-target/+page.server.ts:5-11`
- Daily Verse on /calendar requires BOTH `showDailyVerse` and the `verse` Dashboard Module; a hidden verse costs no read and adds no warning — `+page.server.ts:186-200` · test: `page.server.test.ts` › "setting on, module hidden in /account — the reported bug" / "hiding the verse carries no warning — a hidden module is not a failure"
- Guest-merge prompt only for a registered account with a claimable stash cookie; an Anonymous Account is never sent to `/merge-guest` — `+page.server.ts:49-66` · test "an Anonymous Account (placeholder email) with a stale stash cookie is not sent to /merge-guest"
- The calendar list is the viewer's Personal Calendar first (`Personal Calendar`, settings colour else `#fa8072`) then the family calendar (`families.name` else `Family Calendar`, colour else `#e0ffff`); the personal calendar is provisioned on load — `calendarData.ts:19-20,36-58,120-141` · `+page.server.ts:205-210`
- Sponsored events are served only when the ad gate (`showAdsAsEvents`) is on, render amber `#f59e0b`, and sit on no calendar so no filter can hide them — `calendarData.ts:62-92` · `+page.server.ts:181-185,211-212`
- The edit modal's roster keeps first/last names and the task tab receives the viewer's categories — `+page.server.ts:72-79,98` · test "keeps first/last names on the roster and serves the category list"
- Each section degrades to its fallback plus a warning label, never a 500; a rejected stream draws `Couldn't load your events.` with Retry — `+page.server.ts:42-47` · `+page.svelte:547-556,603-612`
- Swipe navigation is month-only; Today stays live but reads as current on the period already shown — `calendarView.ts:120-135` · `Calendar.svelte:444-461` · tests "never navigates off month view (week/day pan, list scrolls)" / `CalendarToolbar.svelte.test.ts` › "says where it already is when the period on screen is this one"

### Page and UI behaviour worth keeping

- ONE 80rem card welds toolbar to grid, with the Key strip under the grid; the skeleton wears the same card and the same 72/92/104px cells — `Calendar.svelte:467-480` · `+page.svelte:534-546` · test: `Calendar.svelte.test.ts` › "puts the toolbar and the grid inside ONE card, capped at 80rem"
- Toolbar rows: view toggle (Month/Week/List) · one centred date pill (month label is its leading segment, mini month/year picker, prev/next, Today) · Add-mode and Select toggles · Filters trigger with the word plus a hidden-count badge · action strip (Import, Print, Day dashboard, Calendar settings) folding behind a 44px sandwich below `sm`; search is a full-width second row with a visible `⌘K` hint and a `N of M` / `No matches` status + Clear — `CalendarToolbar.svelte:120-140,350-430,506-560,668-720` · test "opens on ⌘K and on Ctrl+K — the shortcut still works"
- Filters is one sheet at every width (bottom sheet below `sm`, same sheet centred at 26rem above), with a grab handle, per-calendar switches wearing the calendar colour, `Hide all`/`Show all`, person rows with avatar + count (or `–` when off) and `Show everyone`, and footer copy saying it is a reading filter — `CalendarToolbar.svelte:595-660,690-808` · test "is a bottom sheet below sm and the SAME sheet, centred, from sm up"
- Three distinct empty states replace the grid, each with one-tap recovery: "Every calendar is hidden" (Show all calendars), "Nothing matches “<query>”" (Clear search), "Nothing for <Name> in this view" (Show everyone); the Key is suppressed on all three — `Calendar.svelte:540-660` · test "says so when the filter matches nothing, and clears in one action"
- Month cell: fixed height (72/92/104px) that clips rather than grows, weekend wash, today ring + filled disc, 3 event chips + 2 task chips and `+{n} more`; per-cell `+` (add) and Day-dashboard links reveal on hover/focus only and are inert while invisible — `MonthDayCell.svelte:56-66,78-120,300-306` · test "clips, so a busy Tuesday cannot push the bottom of the month off the screen"
- Chips keep the shared vocabulary — shape = kind (timed dot, all-day bar, task dashed, sponsored hatched bag), colour = calendar, RSVP badge, creator badge, attendance badge; the Key explains all of it and starts folded — `CalendarKey.svelte:29-70,95-150` · test "says what shape means, and keeps the key folded until it is asked for"
- Day action sheet rows: the day heading, the day's events with times/RSVP, then `Add event`, `Open Day Dashboard` (with `?date=`), `View this day's events`, `Open Day View`; swipe-down past 100px dismisses — `DayActionSheet.svelte:88-160,196-296`
- `+N more` opens DayEventsModal listing the day's events and due Tasks; closing it returns to a closed state that can reopen — `MonthDays.svelte:78-95` · test: `DayEventsModal.svelte.test.ts` › "notifies the parent on Close so \"+N more\" can reopen the modal"
- Day and week grids: an empty-slot tap opens create at that minute (15-minute snap); drag paints a range with `−15` / `+15` / `Create` / dismiss; a long-press selects a default hour; Add mode drags with no long-press; dropping an event PUTs it and preserves duration; the day grid autoscrolls to the current hour (07:00 on other days) — `DayHourGrid.svelte:48-58,100-140` · test: `DayView.svelte.test.ts` › "starts a new event at the tapped slot, snapped to 15 minutes" / "moves a dropped event with a PUT preserving duration"
- Week all-day band shows all-day chips (glyph only, band header already says "All day") plus that day's due Tasks; week start honours the setting — `WeekAllDayRow.svelte:38-70` · test: `WeekView.svelte.test.ts` › "week start honours the setting"
- Day view: back button returns to the previous view; header shows the date plus a Today pill; a day with nothing draws "Nothing scheduled. A free day is a gift — or add something fun." + Add event — `DayHeader.svelte:14-40` · `DayView.svelte:330-352` · `Calendar.svelte:160-180`
- Day view's all-day band is full-width rows that name the kind (the month cell only has room for a bar), and the day's due Tasks get their own dashed "Tasks" group showing recurrence as `🔁 2× Weekly` — `DayAllDayList.svelte:35-118`
- The create modal's Task tab is title (with quick-add help) + Visibility (`Public — family can see it (read-only)` / `Private — only you and the assignee`, and a `#public`/`#private` tag in the title wins over it) + optional Due Date + Category — `EventTaskFields.svelte:38-99`
- List view groups events + due Tasks by day under sticky headers, marks today with a pill, and an empty month draws "A whole month of nothing. Suspicious. Add something fun?" — `ListView.svelte:92-102`
- Toasts name what changed: `Hidden <cal> — its events and due tasks are out of every view.` / `Showing <cal> again.` / `All calendars hidden. Tap "Show all" to bring them back.` / `Deleted N event(s).` / `Moved N event(s) to <cal>.` / `Applied N change(s) to your events.` — `Calendar.svelte:352-372` · `+page.svelte:203-225`
- First-run card "Blank calendar!" with a link to Smart tasks; dismissal persists in `familyplanz:firstRunDismissed`; shown only when there are no events and no due Tasks — `+page.svelte:394-397,383-390` · test: `FirstRunCard.svelte.test.ts` › "fires dismiss"
- Selecting page text surfaces a floating "Create event from selection" button that seeds Quick Add — `+page.svelte:356-372,682-690`
- While a month is being fetched the grid shows `Downloading this month…`; the Quick Add FAB hides in Selection mode, where the bulk bar takes its place — `Calendar.svelte:512-516` · `+page.svelte:627-655`

### Probably accidental (candidates to drop, owner to confirm)

- `removeEvent` is threaded Calendar → WeekView and explicitly voided — dead since EventModal took deletion — `Calendar.svelte:43` · `WeekView.svelte:30,50`
- `CalendarSelector.svelte` has zero importers (census) — dead component
- `selectedEventRsvp` is only ever set to `[]` before opening the modal — dead plumbing — `+page.svelte:110,503,726`
- `stashCalendarData` returns `''` purely to run a side effect from markup — `+page.svelte:314-317,547`
- MonthDays mutates its own `currentDate` prop to shift months instead of deriving the date — `MonthDays.svelte:40-47`
- DayEventsModal parses `MM-dd-yyyy` because MonthDays hands it `formatDate()` keys rather than ISO — `DayEventsModal.svelte:32-42` · test pins the workaround: "formats the \"MM-dd-yyyy\" date fed in by MonthDays"
- `MonthView`'s hand-rolled `firstDayOfMonth - dayOffset` / last-month index arithmetic duplicates Luxon week math — `MonthView.svelte:29-57`
- Same prop, two different defaults: `preferedFirstDayOfWeek` is `'Monday'` in MonthView and `'sunday'` in WeekView/Calendar — `MonthView.svelte:16` · `WeekView.svelte:31` · `Calendar.svelte:44`
- First-run card counts sponsored events as content (`allEvents` includes `adEvents`), so an ad alone suppresses the blank-calendar card — UNSURE — `+page.svelte:320-326,394-397`
- "Is this the family calendar?" is answered by `calendarIds.slice(1)`, i.e. by list position rather than by each ref's `kind` — a missing personal calendar silently promotes the family one into index 0, tinting family events with the personal colour — `+page.svelte:50,446` vs `calendarData.ts:120-141`
- Smart bulk phase 2 executes the plan echoed back by the client — trust-boundary artifact, owner to confirm — `+page.svelte:253-259`
- `localExtras` optimistic rows are cleared only after `invalidateAll()` resolves, so a fast reload can briefly draw the event twice — UNSURE — `+page.svelte:443-456`
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#040](../../archive/issues/040-calendar-load-vm-error.md) Console TypeError on calendar load — waiting on the reporter. | OWNER | owner |
| [#119](../../archive/issues/119-calendar-mobile-rail-must-not-exist.md) Measure toolbar/fold at 1280×800; Prototype E review traffic. | DESIGN | keep markup |
| [#120](../../archive/issues/120-calendar-toolbar-three-marks.md) Fold measurement; keyboard parity after DayNav adoption. | DESIGN | keep markup |
| [#201](../../archive/issues/201-cant-see-events-next-month.md) Live-verify "can see next month's events" after #082. | BEHAVIOUR | keep; verify on the preview after the calendarPage port |
| [#202](../../archive/issues/202-mobile-calendar-tap-targets-and-sandwich-menu.md) Overflow-sheet toast ack, 360px Playwright spec, add-modal reassessment. | BEHAVIOUR | keep; port must not regress |

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# calendarPage: 0% ported

legacy source files left (32/32, 6326 LOC):
  - src/lib/components/calendar/BulkEditBar.svelte (313 LOC, ui) importers: 1
  - src/lib/components/calendar/Calendar.svelte (733 LOC, ui) importers: 1
  - src/lib/components/calendar/CalendarKey.svelte (132 LOC, ui) importers: 1
  - src/lib/components/calendar/CalendarSelector.svelte (93 LOC, ui) importers: 0
  - src/lib/components/calendar/CalendarToolbar.svelte (808 LOC, ui) importers: 1
  - src/lib/components/calendar/DayActionSheet.svelte (296 LOC, ui) importers: 1
  - src/lib/components/calendar/DayAllDayList.svelte (119 LOC, ui) importers: 1
  - src/lib/components/calendar/DayEventsModal.svelte (211 LOC, ui) importers: 1
  - src/lib/components/calendar/DayHeader.svelte (37 LOC, ui) importers: 1
  - src/lib/components/calendar/DayHourGrid.svelte (247 LOC, ui) importers: 1
  - src/lib/components/calendar/DayView.svelte (409 LOC, ui) importers: 1
  - src/lib/components/calendar/EmptyState.svelte (17 LOC, ui) importers: 1
  - src/lib/components/calendar/EventTaskFields.svelte (89 LOC, ui) importers: 1
  - src/lib/components/calendar/ExitSelectionAsk.svelte (38 LOC, ui) importers: 2
  - src/lib/components/calendar/FirstRunCard.svelte (41 LOC, ui) importers: 1
  - src/lib/components/calendar/ListView.svelte (290 LOC, ui) importers: 1
  - src/lib/components/calendar/MonthDayCell.svelte (308 LOC, ui) importers: 1
  - src/lib/components/calendar/MonthDays.svelte (179 LOC, ui) importers: 1
  - src/lib/components/calendar/MonthView.svelte (101 LOC, ui) importers: 1
  - src/lib/components/calendar/WeekAllDayRow.svelte (111 LOC, ui) importers: 1
  - src/lib/components/calendar/WeekHeader.svelte (40 LOC, ui) importers: 1
  - src/lib/components/calendar/WeekHourGrid.svelte (238 LOC, ui) importers: 1
  - src/lib/components/calendar/WeekView.svelte (405 LOC, ui) importers: 1
  - src/lib/components/calendar/calendarView.ts (122 LOC, model) importers: 3
  - src/lib/server/services/calendarData.ts (141 LOC, server) importers: 4
      NOTE: SPLIT: personal-calendar provisioning + family calendar info + event window reads -> calendar service; sponsored/verse/dashboard-module composition -> calendarPage screen load.
  - src/lib/utils/calendarAssignees.ts (278 LOC, client) importers: 2
  - src/lib/utils/calendarSearch.ts (53 LOC, model) importers: 1
  - src/lib/utils/calendarVisibility.ts (133 LOC, client) importers: 2
  - src/lib/utils/dayViewLayout.ts (105 LOC, model) importers: 4
  - src/lib/utils/listGroup.ts (31 LOC, model) importers: 1
  - src/lib/utils/rangeSelect.ts (184 LOC, model) importers: 4
  - src/lib/utils/weekView.ts (24 LOC, model) importers: 0

route files not yet wiring-only (4/4):
  - src/routes/(calendar)/calendar/+page.server.ts  /calendar
      NOTE: Two raw event SELECTs -> calendar repo; the rest is calendarPage screen composition.
  - src/routes/(calendar)/calendar/+page.svelte  /calendar
      NOTE: Fat page: extract state into `<name>.state.svelte.ts` + pure rules; the screen component stays under ~250 lines.
  - src/routes/share-target/+page.server.ts  /share-target
  - src/routes/share-target/+page.svelte  /share-target

legacy test files left (31/31) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/components/calendar/BulkEditBar.svelte.test.ts [component, 7 tests]
  - src/lib/components/calendar/Calendar.svelte.test.ts [component, 44 tests]
  - src/lib/components/calendar/CalendarToolbar.svelte.test.ts [component, 54 tests]
  - src/lib/components/calendar/DayActionSheet.svelte.test.ts [component, 5 tests]
  - src/lib/components/calendar/DayAllDayList.svelte.test.ts [component, 7 tests]
  - src/lib/components/calendar/DayEventsModal.svelte.test.ts [component, 11 tests]
  - src/lib/components/calendar/DayHeader.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/DayHourGrid.svelte.test.ts [component, 7 tests]
  - src/lib/components/calendar/DayView.svelte.test.ts [component, 9 tests]
  - src/lib/components/calendar/EventTaskFields.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/ExitSelectionAsk.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/FirstRunCard.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/ListView.svelte.test.ts [component, 5 tests]
  - src/lib/components/calendar/MonthDayCell.svelte.test.ts [component, 34 tests]
  - src/lib/components/calendar/MonthDays.svelte.test.ts [component, 3 tests]
  - src/lib/components/calendar/MonthView.svelte.test.ts [component, 0 tests]
  - src/lib/components/calendar/WeekAllDayRow.svelte.test.ts [component, 8 tests]
  - src/lib/components/calendar/WeekHeader.svelte.test.ts [component, 2 tests]
  - src/lib/components/calendar/WeekHourGrid.svelte.test.ts [component, 9 tests]
  - src/lib/components/calendar/WeekView.svelte.test.ts [component, 14 tests]
  - src/lib/components/calendar/calendarView.test.ts [pure, 21 tests]
  - src/lib/components/calendar/eventModalRoster.svelte.test.ts [component, 7 tests]
  - src/lib/utils/calendarAssignees.test.ts [pure, 26 tests]
  - src/lib/utils/calendarSearch.test.ts [pure, 10 tests]
  - src/lib/utils/calendarVisibility.test.ts [pure, 27 tests]
  - src/lib/utils/dayViewLayout.test.ts [pure, 16 tests]
  - src/lib/utils/listGroup.test.ts [pure, 4 tests]
  - src/lib/utils/rangeSelect.test.ts [pure, 13 tests]
  - src/lib/utils/weekView.test.ts [pure, 1 tests]
  - src/routes/(calendar)/calendar/layout.svelte.test.ts [component, 2 tests]
  - src/routes/(calendar)/calendar/page.server.test.ts [route, 4 tests]
```
<!-- census:end -->
