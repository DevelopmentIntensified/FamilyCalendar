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

Designed at S1 (2026-11-11). New paths are under `src/lib/screens/calendarPage/` unless they start with `src/`. Steps stay unticked until each step's check is green. The performance plan is the core of this task: it is at the end of this section.

### Entry files (they exist as stubs and are filled in later steps)

| file | role | contents |
|---|---|---|
| `index.ts` | entry | `CalendarPageModel` (shell + the streamed `grid`), `CalendarView`. Six public exports in total; everything else stays private. |
| `index.server.ts` | entry | `calendarPageLoad`, `shareTargetLoad`, `getCalendarPage`. |
| `ui/index.ts` | entry | `CalendarPage`. |
| `README.md` | docs | Design, invariants and dependencies (written at S1). |

### Server: contract, service, http (S3–S6)

| file | role | contents |
|---|---|---|
| `calendarPage.contract.ts` | contract | zod for the page's search params (`date`, `view`, `quickadd`, `title`, `text`, `url`, `edit`, `dashboardView`), the client action inputs the state classes take (bulk op passthrough, phrase report), and the `CalendarPageModel` types — shell, `grid`, and row shapes carrying only the fields the screen renders. |
| `calendarPage.service.server.ts` | service | `getCalendarPage(ctx, actor, input)`: the one use-case. Owns the section list, the degrade-to-fallback + warning per section (labels `calendar`, `events`, `tasks`, `ads`, `verse`, `merge-check`), the roster mapping (id + first + last), the viewer's `today`/zone and the `window` (month grid), and starts the `grid` promise before returning the shell. Calls domains only through their `index.server.ts`. |
| `calendarPage.http.server.ts` | http | `calendarPageLoad = pageLoad({ auth: 'user', handle })` and `shareTargetLoad = pageLoad({ auth: 'optional', handle })`. No form actions: every write goes through a domain's `/api` route. |

### Pure rules (S3)

| file | role | contents — legacy source |
|---|---|---|
| `calendarPage.url.rules.ts` | rules | `parseCalendarUrl(search)` (date/view/quickadd/edit/dashboardView; invalid params ignored), `dashboardRedirect(search, settings)`, `shareTargetText(title, text, url)` (folds calendar's `buildSharedTargetText`), `createSeedFromUrl(search)`. From `+page.svelte:89-107,333-356` and `src/routes/share-target/+page.server.ts:5-11`. |
| `calendarPage.view.rules.ts` | rules | `CalendarView`, `VIEW_BREAKPOINT_PX`, `resolveCalendarLayout`, `resolveCalendarInitialView`, `isCalendarCurrentPeriod`, `shouldSwipeNavigate`, `viewFromSettingKey`/`viewFromName`. From `calendarView.ts` (whole file). |
| `calendarPage.calendars.rules.ts` | rules | `isCalendarHidden`, `toggleCalendarVisibility`, `setAllCalendarsHidden`, `hiddenCalendarNames`, `visibleByCalendar`, plus the stored-shape parse/serialize the kernel `localPref` codec uses. From `calendarVisibility.ts` (its `KeyValueStorage` boilerplate dies into `localPref`). |
| `calendarPage.people.rules.ts` | rules | `assigneeRoster`, `assigneeCounts`, `isAssigneeHidden`, `toggleAssigneeVisibility`, `visibleByAssignee`, `hiddenAssigneeNames`, storage codec. From `calendarAssignees.ts`. |
| `calendarPage.search.rules.ts` | rules | `normaliseCalendarQuery`, `byCalendarSearch`, `countCalendarMatches`. From `calendarSearch.ts`. |
| `calendarPage.lanes.rules.ts` | rules | `layoutCalendarDaySlots` (greedy lanes, per-overlap-cluster lane counts) and `nowLinePercent(now)`. From `dayViewLayout.ts`; `nowPositionPct()`'s own `new Date()` dies (R5). |
| `calendarPage.grid.rules.ts` | rules | The month matrix (`monthGridCells(date, weekStart)` incl. leading/trailing days — replaces MonthView's hand-rolled `firstDayOfMonth - dayOffset` math), the week span, `gridWindow(date, weekStart)`, `groupCalendarRowsByDay` (delegates to kernel/time `groupByDay`), per-day counts, and `chipRowOf(event, calendars)` (kind + colour + labels resolved once). `listGroup.ts` and `weekView.ts` die here. |
| `calendarPage.select.rules.ts` | rules | `RangeSelectMachine` (drag / long press / Add mode / steppers / suppress-click), with pixel↔minute and range formatting taken from calendar's `eventMove`. From `rangeSelect.ts`. |

### Client state (S7)

| file | role | contents |
|---|---|---|
| `calendarPage.state.svelte.ts` | state | `CalendarPageState`: model + date + view + search + hidden calendars/people + open modal ids; derived: the filter rung (calendars → search → people), `days: Map<dayKey, DayRows>` built once per rows change, assignee rows, counts, empty-state kind, `todayKey` from the kernel ticker. Methods for navigation, filter toggles (with the legacy toasts), deep-link handling and modal opens. |
| `calendarPage.range.state.svelte.ts` | state | `CalendarRangeCache`: the bounded 12-month fetched cache, per-month replacement, the occurrence-key merge where page-load rows win, the generation guard, attempted-on-failure, busy months. From `Calendar.svelte:183-303`. |
| `calendarPage.bulk.state.svelte.ts` | state | `CalendarBulkState`: selection ids (`Set`), selection-mode reset, inline delete confirm, smart dry-run → review → apply, past-date warning, error copy, phrase report, the bulk toasts. From `+page.svelte:122-296`. |

### Components (S7)

| file | role | contents — legacy source |
|---|---|---|
| `ui/CalendarPage.svelte` | component | Screen root: the one card, the skeleton, warnings, first-run card, the mounted view (lazy), FAB, bulk bar, selection-from-text, share note and the lazy modals. From `+page.svelte` (layout half) + `Calendar.svelte` (shell half). |
| `ui/CalendarToolbar.svelte` | component | View toggle, date pill (kernel `DayNav` for nav), Add/Select, Filters trigger + badge, action strip and sandwich, search row. From `CalendarToolbar.svelte:120-563`. |
| `ui/CalendarFiltersSheet.svelte` | component | The one Filters sheet (calendars + people), on kernel `Sheet`. From `CalendarToolbar.svelte:625-790`. |
| `ui/MiniPicker.svelte` | component | Mini month/year picker. From `CalendarToolbar.svelte:240-350`. |
| `ui/CalendarKeyStrip.svelte` | component | Folded Key strip rendering calendar's `chipSurfaceStyle` + `ChipKindMark`. From `CalendarKey.svelte`. |
| `ui/CalendarChip.svelte` | component | One chip for all four views (`density`: glyph / band / word), selection ring, RSVP/creator/attendance badges. Replaces the six duplicated chip blocks in MonthDayCell, WeekAllDayRow, WeekHourGrid, DayHourGrid, DayAllDayList and ListView. |
| `ui/MonthView.svelte` | component | The six-week matrix from `grid.rules` + weekday headers. From `MonthView.svelte` + `MonthDays.svelte`. |
| `ui/MonthCell.svelte` | component | The fixed-height cell (chips, `+N more`, hover tools; `data-testid`s kept). From `MonthDayCell.svelte`. |
| `ui/WeekView.svelte` | component | Week header (folded `WeekHeader.svelte`), all-day band and the hour grid. From `WeekView.svelte`. |
| `ui/WeekAllDayBand.svelte` | component | All-day chips + due Tasks per day. From `WeekAllDayRow.svelte`. |
| `ui/HourGrid.svelte` | component | ONE hour grid for 1..7 columns: hour rows, current-hour wash, lane-laid chips, range painter + steppers, drop target, autoscroll. Replaces `DayHourGrid.svelte` + `WeekHourGrid.svelte`. |
| `ui/DayView.svelte` | component | Header (date + Today pill + Back), all-day rows, empty state, hour grid. From `DayView.svelte` + `DayHeader.svelte`. |
| `ui/DayAllDayList.svelte` | component | Named all-day rows and the Tasks group with `🔁 2× Weekly`. From `DayAllDayList.svelte`. |
| `ui/ListView.svelte` | component | Sticky day headers, Event rows and due Tasks, empty copy. From `ListView.svelte`. |
| `ui/DayActionSheet.svelte` | component | Mobile day sheet with its four actions, on kernel `Sheet`. From `DayActionSheet.svelte`. |
| `ui/DayEventsModal.svelte` | component | The `+N more` day list (ISO keys; the `MM-dd-yyyy` parse dies). From `DayEventsModal.svelte`. |
| `ui/BulkEditBar.svelte` | component | Selection toolbar, delete confirm, smart review, past warning. From `BulkEditBar.svelte`. |
| `ui/SelectionExitAsk.svelte` | component | Inline "Exit selection mode to move this event?" ask. From `ExitSelectionAsk.svelte`. |
| `ui/CreateAnythingModal.svelte` | component | Create wrapper: calendar's Event form + Quick Add + a Task tab (composes `ui/TaskFields.svelte`, tasks' help and the checklist snippet). From `+page.svelte:650-700` and `EventFormModal`'s task mode, which calendar's sheet says moves here. |
| `ui/TaskFields.svelte` | component | Task title, Visibility, optional Due Date, Category. From `EventTaskFields.svelte`. |
| `ui/FirstRunCard.svelte` | component | "Blank calendar!" card. From `FirstRunCard.svelte` + `EmptyState.svelte`. |
| `ui/FilterEmpty.svelte` | component | The three filter empty states (one shape, three claims). From `Calendar.svelte:540-660`. |

### Tests (planned)

- Rules: `calendarPage.{url,view,calendars,people,search,lanes,grid,select}.rules.test.ts`.
- State: `calendarPage.state.test.ts`, `calendarPage.range.state.test.ts`, `calendarPage.bulk.state.test.ts`.
- Service: `calendarPage.service.db.test.ts` (a vertical slice; it has no fixtures of its own — it seeds through kernel `seedUser` and the owning modules' fixtures).
- UI: `ui/{CalendarPage,CalendarToolbar,CalendarFiltersSheet,MiniPicker,CalendarKeyStrip,CalendarChip,MonthView,MonthCell,WeekView,WeekAllDayBand,DayView,DayAllDayList,ListView,DayActionSheet,DayEventsModal,BulkEditBar,SelectionExitAsk,CreateAnythingModal,FirstRunCard,FilterEmpty}.svelte.test.ts`.
- No `calendarPage.http.db.test.ts`: the module owns no `/api` route, so S2 is a no-op here.

### Legacy exports, and where each one goes or why it dies

| legacy | new home |
|---|---|
| `src/lib/components/calendar/calendarView.ts` | `calendarPage.view.rules.ts` (`resolveInitialView` → `resolveCalendarInitialView`, `isCurrentPeriod` → `isCalendarCurrentPeriod`) |
| `src/lib/utils/calendarVisibility.ts` | `calendarPage.calendars.rules.ts`; storage boilerplate → kernel `localPref` |
| `src/lib/utils/calendarAssignees.ts` | `calendarPage.people.rules.ts`; storage boilerplate → kernel `localPref` |
| `src/lib/utils/calendarSearch.ts` | `calendarPage.search.rules.ts` |
| `src/lib/utils/dayViewLayout.ts` | `calendarPage.lanes.rules.ts`; `nowPositionPct()` → `nowLinePercent(now)` |
| `src/lib/utils/rangeSelect.ts` | `calendarPage.select.rules.ts`; `yToMinutes`/`normalizeRange`/`formatRangeLabel` come from calendar's `eventMove` |
| `src/lib/utils/listGroup.ts` | dies: `groupByDay` + `dayKey` from kernel/time (K-06); `toDateMs` → kernel/time |
| `src/lib/utils/weekView.ts` | dies: 0 importers |
| `src/lib/components/calendar/CalendarSelector.svelte` | dies: 0 importers |
| `src/lib/components/calendar/EmptyState.svelte` | dies: folded into `ui/FilterEmpty.svelte` and `ui/FirstRunCard.svelte` |
| `src/lib/components/calendar/DayHeader.svelte` | dies: folded into `ui/DayView.svelte` |
| `src/lib/components/calendar/WeekHeader.svelte` | dies: folded into `ui/WeekView.svelte` |
| `src/lib/components/calendar/MonthDays.svelte` | dies: the matrix moves to `calendarPage.grid.rules.ts` + `ui/MonthView.svelte` |
| `src/lib/components/calendar/DayHourGrid.svelte` + `WeekHourGrid.svelte` | one `ui/HourGrid.svelte` |
| `src/lib/components/calendar/Calendar.svelte` | `calendarPage.state.svelte.ts` + the shell half of `ui/CalendarPage.svelte` |
| `src/lib/components/calendar/CalendarToolbar.svelte` | `ui/CalendarToolbar.svelte` + `ui/CalendarFiltersSheet.svelte` + `ui/MiniPicker.svelte` |
| `src/lib/components/calendar/CalendarKey.svelte` | `ui/CalendarKeyStrip.svelte` |
| `src/lib/components/calendar/BulkEditBar.svelte` | `ui/BulkEditBar.svelte` + `calendarPage.bulk.state.svelte.ts` |
| `src/lib/components/calendar/DayActionSheet.svelte` | `ui/DayActionSheet.svelte` |
| `src/lib/components/calendar/DayEventsModal.svelte` | `ui/DayEventsModal.svelte` |
| `src/lib/components/calendar/DayView.svelte` | `ui/DayView.svelte` (+ the header) |
| `src/lib/components/calendar/DayAllDayList.svelte` | `ui/DayAllDayList.svelte` |
| `src/lib/components/calendar/ListView.svelte` | `ui/ListView.svelte` |
| `src/lib/components/calendar/MonthView.svelte` | `ui/MonthView.svelte` |
| `src/lib/components/calendar/MonthDayCell.svelte` | `ui/MonthCell.svelte` + `ui/CalendarChip.svelte` |
| `src/lib/components/calendar/WeekView.svelte` | `ui/WeekView.svelte` |
| `src/lib/components/calendar/WeekAllDayRow.svelte` | `ui/WeekAllDayBand.svelte` |
| `src/lib/components/calendar/FirstRunCard.svelte` | `ui/FirstRunCard.svelte` |
| `src/lib/components/calendar/ExitSelectionAsk.svelte` | `ui/SelectionExitAsk.svelte` |
| `src/lib/components/calendar/EventTaskFields.svelte` | `ui/TaskFields.svelte` inside `ui/CreateAnythingModal.svelte` |
| `src/lib/server/services/calendarData.ts` | split: calendars + provisioning → the `calendar` module (its census note); verse/ads composition → `calendarPage.service.server.ts` calling verse + sponsored + dashboardModules. The file itself stays after our S8 because `/api/calendars`, `/api/daily-verse` and `/api/sponsored-events` still import it |
| `src/routes/(calendar)/calendar/+page.server.ts` | `calendarPage.http.server.ts` + `calendarPage.service.server.ts`; the route becomes wiring |
| `src/routes/(calendar)/calendar/+page.svelte` | `ui/CalendarPage.svelte` + the two state classes; the route becomes wiring |
| `src/routes/share-target/+page.server.ts` | `calendarPage.http.server.ts` (`shareTargetLoad`); the route becomes wiring; its `+page.svelte` frame stays with shell |
| `src/routes/(calendar)/calendar/+layout.server.ts`, `+layout.svelte`, `layout.svelte.test.ts` | not this module: `shell` owns them (`shell.md` census). Nothing in them changes here |

### Performance — the load plan for each page (ADR 0010)

Targets: desktop ready 300 ms (fail 1000), first visit 500 ms (fail 1000), mobile repeat 600 ms (fail 1000), TTFB 100 ms (fail 300), initial JS 100 KB gzip and never above the recorded legacy ceiling. Legacy baseline for this page: ~1.35 s TTFB, 465 KB HTML (ADR 0010 / page-perf-playbook).

#### `/calendar` — one route, four catalog entries

The K-10 catalog gets four pages for this route — `/calendar` (month), `/calendar?view=week`, `?view=day`, `?view=list` — because each opening view is its own lazy chunk. Ready selector: the mounted view's first real cell — `[data-testid="calendar-month-cell"]` for month, with `calendar-week-day`, `calendar-day-grid` and `calendar-list-day` for the other three — so the measurement waits for rows, never for the skeleton. The legacy `data-testid`s are kept.

**Above the fold (shell, no stream):** the toolbar (view toggle, date pill, Filters trigger, search row), the card frame, the Daily Verse card when visible, and either the grid or its skeleton. Seed params (`?date`, `?view`, `?edit`, `?quickadd`) resolve in the shell, so the first render is already the right view and date.

**Reads.** The shell waits for two small reads; the grid promise starts before the shell is returned.

| wave | read | through | queries | bounded by |
|---|---|---|---|---|
| 0 | URL rules, Dashboard redirect | pure | 0 | — |
| 0 | guest-merge check | identity | 0–1, only with the stash cookie | the cookie |
| 1 | settings, `familyId`, roster | `parent()` (shell layout) | 0 | already loaded once per group entry |
| 1 | calendars + personal provisioning | `calendar` | 1–2 | the viewer |
| 1 | Daily Verse visibility + verse | `dashboardModules` + `verse` | 0 when hidden, 1 otherwise (+0: the verse list is local) | the viewer's one visibility answer |
| 2 | Event range (personal + family, Occurrences with RSVP/attendance/creator) | `calendar` | ≤5, the ids-dependent pair inside the module | the month grid window (~42 days) |
| 2 | due Tasks in the window | `tasks` | 1 (+1 batched cursor UPDATE owned by the module) | the month grid window |
| 2 | Sponsored Events for the month | `sponsored` | 0 when the gate is off, else 1 | the viewer's month |
| on demand | task categories | `tasks` | 1, when the create modal's task tab first opens | the viewer |

Shell = waves 0–1; `grid` = wave 2. Total 3–9 queries per page load; legacy ran roughly 15–20, including two Event SELECTs that read every recurring master in full, one unbounded Task SELECT and a per-load cursor write.

**What streams with a skeleton:** `grid` only. The card renders at once with 42 skeleton cells at the same 72/92/104px heights inside the same 80rem card, and the real toolbar stays usable while it fills. The Daily Verse is shell, so it never pops in above the grid. Warnings appear under the toolbar as they arrive. A rejected `grid` draws `Couldn't load your events.` + Retry.

**What loads on demand (`import()`), and when it is prefetched:**

| chunk | legacy weight | first use | prefetch |
|---|---|---|---|
| the opening view (Month/Week/Day/List) | four views + grid helpers, all in the page chunk | in parallel with `grid`, before the first grid paint | — |
| the other three views | — | first switch to that view (skeleton for that frame) | on hover/focus of the view toggle |
| `CreateAnythingModal` (calendar's Event form + `TaskFields` + checklist snippet) | form 759 + model 732 + task fields 89 | first FAB / cell `+` / range `Create` / `?quickadd` | on FAB hover/focus and idle after the grid paints (legacy precedent) |
| `EventModal` (calendar) | 443, statically imported by all four views today | first chip click | on chip hover/focus |
| `TaskDetailModal` (tasks) | statically imported by all four views today | first task-chip click | on task-chip hover/focus |
| `DayEventsModal` | 211 | first `+N more` | — |
| `DayActionSheet` | 296 | first narrow-width cell tap | — |
| `BulkEditBar` | 313 | Select toggled on | — |
| `CalendarFiltersSheet` | part of the 808 toolbar | first Filters open | on trigger hover/focus |
| `MiniPicker` | part of the toolbar | first date-pill click | — |

**Rendering (cheap by construction):** one `Map<dayKey, DayRows>` per rows change (kernel/time `groupByDay`), read by cells, day columns and list buckets — deleting WeekView's 7×2 per-day filters, WeekAllDayRow's per-day filter, WeekHourGrid's per-day filter+sort, DayView's full-array filter+sort and ListView's month filter. Rows are sorted once per day when the map is built; lane layout runs only for the visible day column(s). Per row the state precomputes the day key, clock labels, chip descriptor (kind, calendar colour, tooltip) and badges, so no luxon parse or format runs inside a cell loop. Selection is a `Set`. "Now" comes from the kernel ticker, so no `new Date()` runs in render.

**Legacy costs found (each becomes a slice with a before/after measurement):**

1. Unbounded Task read plus a write in the read path: `getTasksForUser` selects every non-archived Task in scope with no due filter and no limit, plus a tags read (`src/lib/server/db/actions/tasks/queries.ts:21-70`), the loader then filters due/undone in JS (`+page.server.ts:214-247`), and the same call runs a cursor SELECT + UPDATE (`src/lib/server/db/actions/tasks/cursor.ts:256-303`).
2. Two event pipelines, each re-reading exceptions, RSVP, attendance and creator names (`eventDisplayService.ts:130-176` over `+page.server.ts:150-200`) — about 7 queries for a 42-day grid.
3. Full Event rows serialised (`db.select().from(events)`, `+page.server.ts:110-130,140-160`) although the grid renders ~10 fields.
4. The client range fetch asks for month bounds, not the grid window (`+page.svelte:44-54`), so adjacent-month cells can stay empty after a hop; the response also colours rows with `calendarIds.slice(1)` (`:50`).
5. Statically imported views and modals: `Calendar.svelte:1-12` (four views + toolbar + verse card + key), `MonthDays.svelte:1-14` (three modals + EventModal + TaskDetailModal), `WeekView.svelte:1-30`, `DayView.svelte:1-30`, `ListView.svelte:1-22`.
6. Per-day scans: `WeekView.svelte:73-100` (7 + 7 + 7 passes), `WeekAllDayRow.svelte:74-77`, `WeekHourGrid.svelte:83-95` (filter + sort + layout per day), `DayView.svelte:57-68`.
7. Luxon parse/format inside those loops: `formatDate`/`toDate` per row in `WeekView.svelte:73-87`, `ListView.svelte:44-67`, `MonthDays.svelte:54-55`.
8. `selectedIds.includes` per chip (`MonthDays.svelte:46-48`).
9. Real clock read in render: `DayHourGrid.svelte:53-63`, `dayViewLayout.ts:101-104`, `MonthDays.svelte:51`, `DayView.svelte:50`.
10. The category read is awaited for a modal that may never open (`+page.server.ts:87,305`).
11. A reactive side-effect hack plus an optimistic row list cleared after `invalidateAll()` (`+page.svelte:314-317,443-456`) — the double-draw risk.

Kept as-is because they are already right: the ads and verse gates return before their reads (`calendarData.ts:78-81,104-111`), and the loader streams the heavy half (`+page.server.ts:203-300`).

#### `/share-target`

No data: 0 queries and one 302 (`src/routes/share-target/+page.server.ts:5-11`); the text rule is pure. It is not a catalog page (it never renders), so it has no perf entry.

## Notes

### Surprises and decisions (why the design differs from the draft)

- The census lists `layout.svelte.test.ts` under this module, but the layout it tests belongs to `shell` (`shell.md` census). Nothing in the `(calendar)` group layout changes here.
- The settings default is `dayView` (`src/lib/server/db/schema.ts:76`), not month: on a wide screen the stored setting can open Day, and a phone overrides it with month (#119). The opening order is unchanged.
- Colour is a calendar fact, not a page fact. Legacy decides "family" by `calendarIds.slice(1)`, so a missing personal calendar silently tints family Events with the personal colour (`+page.svelte:50,446`). The new model carries `calendarId` and resolves colour through calendar's `chipShell`, which fixes it by construction — no wire change, pinned by `ui/CalendarChip.svelte.test.ts`.
- The fetched-month range now asks for the grid window, not `startOf('month')..endOf('month')` (`+page.svelte:44-54`), so a hopped-to month's leading/trailing cells are filled, and the cache key is the month whose grid is on screen.
- Task categories move off the page load into the create modal's first task-tab open: the load stops paying for a modal that may never open, and that modal is a lazy chunk anyway (one extra read on a rare path). Owner question 5.
- `getTasksForUser`'s cursor pin is a write in the read path. The screen does not own it: it calls tasks' window-bounded due-task read, and the pin must stay inside that domain (it is one batched UPDATE, `src/lib/server/db/actions/tasks/cursor.ts:285-303`). If tasks' S5 exposes no bounded read, that is a dependency ask, not a file to edit here.
- Personal-calendar provisioning (`ensurePersonalCalendar`) is likewise calendar's write-on-read; the screen only asks for the calendar list.
- Warning labels: legacy sections are `calendar`, `family`, `events`, `tasks`, `ads`, `verse`, `merge-check`; the new section list folds `family` into `calendar`. Owner question 2.
- Smart bulk phase 2 echoes the client's dry-run plan back to `/api/events/bulk` (`+page.svelte:253-259`). That trust boundary is calendar's wire, not a screen decision: this screen keeps sending the plan it reviewed until calendar's contract changes (its sheet owns that question).
- The screen adds no client dependency of its own: it uses what kernel/time (luxon) and the domain chunks already ship, and the four views plus every modal are dynamic imports. Initial JS may only shrink against the legacy ceiling.

### Dropped as internal-only (reason in brackets)

- `removeEvent` threaded Calendar → WeekView and voided (dead since EventModal took deletion) — `Calendar.svelte:43`, `WeekView.svelte:30,50`.
- `selectedEventRsvp`, only ever `[]` before the edit modal (the calendar modal fetches its own RSVP) — `+page.svelte:110,503,726`.
- `stashCalendarData` returning `''` to run a side effect from markup (the state class holds the resolved grid) — `+page.svelte:314-317,547`.
- `localExtras` optimistic rows cleared after `invalidateAll()` (the merged map and occurrence key make the new row appear once) — `+page.svelte:443-456`.
- MonthDays mutating its own `currentDate` prop to shift months (the matrix derives every cell date from the date plus an offset) — `MonthDays.svelte:40-47`.
- DayEventsModal parsing `MM-dd-yyyy` (the day list now receives ISO keys) — `DayEventsModal.svelte:32-42`.
- MonthView's hand-rolled first-day arithmetic (kernel/time month math plus one matrix rule) — `MonthView.svelte:29-57`.
- The same prop with two different defaults (`'Monday'` in MonthView, `'sunday'` elsewhere) — one default, the settings `weekStart`.
- Files that die outright: `weekView.ts` (0 importers), `CalendarSelector.svelte` (0 importers), `listGroup.ts` (kernel/time is its home); `EmptyState.svelte`, `DayHeader.svelte`, `WeekHeader.svelte` and `MonthDays.svelte` fold into their new components.
- `selectedIds: string[]` plus `includes` per chip → a `Set`.
- `nowPositionPct()`'s own clock → `nowLinePercent(now)` fed by the kernel ticker (R5).

### Kept for unported importers

- `src/lib/server/services/calendarData.ts` stays after our S8: `/api/calendars`, `/api/daily-verse` and `/api/sponsored-events` still import it (calendar, verse and sponsored). This module stops importing it at S8.
- `DailyVerseCard.svelte` and `EventModal`/`EventFormModal` stay with verse and calendar until their ports; this screen reaches them through their public entries.

### Questions for the owner

1. **Ads and the first-run card.** Context: the card is suppressed by any row, and `allEvents` includes Sponsored Events (`+page.svelte:320-326,394-397`), so a viewer who opted into ads and created nothing never sees "Blank calendar!" — an ad is enough to look like content. Options: A. Exclude Sponsored Events from the emptiness test (an ad is not the family's content). B. Keep today's behaviour (any row suppresses the card). Recommendation: A; cost is one predicate and it is visible only to ad-opted-in users. Either way the rule is pinned by `calendarPage.state.test.ts › "shows the first-run card only for an empty calendar"`.
2. **Warning label for a family-calendar failure.** Context: the loader warns per section and the banner joins the labels (legacy: `calendar`, `family`, …). The new calendar list is one read, so `family` has nowhere to come from. Options: A. Fold `family` into `calendar` (banner copy changes only when a section fails). B. Keep a separate `family` label by splitting the read. Recommendation: A — the split exists only to serve an old degrade path, and the banner is a failure state, not approved content.
3. **The legacy colour bug (`calendarIds.slice(1)`).** Context: with no personal calendar in the list, index 0 is the family calendar, so every family Event is tinted with the personal colour. Options: A. Fix in the port by resolving colour from `calendarId` (no wire change). B. Keep the positional rule and file a ticket. Recommendation: A; the invariant above pins it.
4. **`?edit=` for an Event outside the loaded window.** Context: the deep link only finds rows in the month window or the fetch cache, so a notification link to a far month shows "Event not found" (`+page.svelte:506-521`). Options: A. Keep today's behaviour and the banner. B. Add a one-Event read (calendar has no `GET /api/events/[id]` on the wire today) before deciding. Recommendation: A for this port; B is a wire addition and needs its own ticket.
5. **Categories: load or on demand.** Context: legacy reads them on every page load for a modal that may never open (`+page.server.ts:87,305`). Options: A. Fetch when the create modal's task tab opens (one read on a rare path, one roundtrip there). B. Keep them in the page payload (no roundtrip, a few hundred bytes on every load). Recommendation: A; the modal is already a lazy chunk, so it has a pending state anyway.

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
