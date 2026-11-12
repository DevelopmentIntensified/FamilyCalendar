# calendarPage

**screen** — the `/calendar` screen: Month, Week, Day and List views over one bounded month window, the toolbar, the reading filters, selection + bulk edit, the Key strip and the create-anything modal.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns: the `/calendar` screen — the opening view and the date it opens on (deep links included), the four views, the toolbar, the Key strip, the three filter empty states and the first-run card.
- Owns: the reading filters — hidden Calendars, hidden people and search — their composition order, and their device-local storage keys; plus selection mode, the bulk edit bar and the smart-plan review.
- Owns: the create-anything modal, a wrapper that composes calendar's Event form with tasks' Quick Add, task fields and checklist snippet.
- Owns: the `?date`, `?view`, `?edit`, `?quickadd` deep links, the "create event from selection" affordance and the `/share-target` redirect.
- Does not own: Events, Recurring Event expansion, Exception Overrides, RSVP/attendance, ICS, bulk-edit execution (the `calendar` domain); Tasks, quick-add grammar, categories, TaskDetailModal (the `tasks` domain); Sponsored Events and their serve gate (the `sponsored` domain); the Daily Verse text and card (the `verse` domain); the one Dashboard Module visibility answer (the `dashboardModules` domain); the `(calendar)` group layout, settings, roster and shell chrome (`shell` → app). No table.

## Files

The public API is designed at S1. The three entry files are empty stubs today; S3–S7 fill them, and this table grows in the same commit as each file.

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: the `CalendarPageModel` type and the `CalendarView` vocabulary. Nothing else leaves the module. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: `calendarPageLoad`, `shareTargetLoad`, `getCalendarPage` (the one composition use-case). | `calendarPage.service.db.test.ts` |
| [ui/index.ts](ui/index.ts) | entry | Public components: `CalendarPage`, the one component the route renders. | `ui/CalendarPage.svelte.test.ts` |

## Public interface

Six exports for a 6.3k-LOC screen. Everything else — eight rule files, three state classes, the range cache, every view and modal — stays private and is tested where it lives.

- `index.ts`:
  - `CalendarPageModel` — the one typed load model: the shell (settings-derived facts, calendars, roster, Daily Verse, deep-link seeds, warnings) plus `grid`, the streamed promise that carries the visible month's Events, Sponsored Events and due Tasks. Deletion test: every component and state method reads its props from this type; without it the load shape is hand-mirrored at each call site, which is the bug class conventions forbid. Components type their props as `CalendarPageModel['grid']`-style slices.
  - `CalendarView` — `'month' | 'week' | 'day' | 'list'`. Deletion test: the view is the one closed vocabulary the toolbar, the four views, the URL rules and the perf catalog share; inlining the union at each site would let a fifth spelling in.
- `index.server.ts`:
  - `calendarPageLoad` — the `pageLoad({ auth: 'user' })` handler: URL rules, the Dashboard redirect, the guest-merge prompt, then `getCalendarPage`.
  - `shareTargetLoad` — the `/share-target` `pageLoad` that 302s into `/calendar?quickadd=…`.
  - `getCalendarPage(ctx, actor, input)` — the one use-case: builds the shell, starts the `grid` promise, degrades each section to its fallback, returns `CalendarPageModel`. Deletion test: deleting it moves ~120 lines of composition, degrade and warning logic into the page handler, which is exactly the fat-loader shape this port removes.
- `ui/index.ts`:
  - `CalendarPage` — the screen component; it owns layout, the state classes and the lazy modal boundaries. The route passes `data` and nothing else.

### Private surface (not exported through an entry)

Rule files `calendarPage.{url,view,calendars,people,search,lanes,grid,select}.rules.ts`; state `calendarPage.state.svelte.ts`, `calendarPage.range.state.svelte.ts`, `calendarPage.bulk.state.svelte.ts`; contract `calendarPage.contract.ts`; http `calendarPage.http.server.ts`; service `calendarPage.service.server.ts`; components under `ui/`.

## How to test

- Whole module: `npm run test:mod -- calendarPage` (add `--legacy` while the 31 legacy test files remain).
- **No HTTP goldens.** This module owns no `src/routes/api/**` route, so there is no `calendarPage.http.db.test.ts`. The wire it calls belongs to calendar (`/api/events`, `/api/events/[id]`, `/api/events/bulk`, `/api/calendars`), tasks (`/api/tasks`) and feedback (`/api/report-phrase`), and those modules' goldens pin it.
- Pure rules: `calendarPage.*.rules.test.ts` — plain tables of input → expected output, no setup. Carry the legacy `pure` cases whose rule survived (view 21, calendars 27, people 26, search 10, lanes 16, select 13) with their titles where they still describe today's behaviour.
- State classes: `calendarPage.*.state.test.ts` run in node with no DOM. They take fake api clients, a fake `Storage` and `memoryToasts()`; nothing is mocked at module level (R9).
- Database + service: `calendarPage.service.db.test.ts` with `rollbackTest` and `testCtx({ db, now })` (needs Postgres: `docker start familycalendar-db`). Rows are seeded through kernel `seedUser` plus the owning modules' fixtures; this module has no fixtures of its own because it owns no table.
- UI: `ui/*.svelte.test.ts` render with props and callbacks, no `$app/*` (R9). Lazy children resolve through the real dynamic `import()`; tests await the chunk.
- Visual + perf: `npm run visual:check -- calendarPage` and `npm run perf:check -- calendarPage`. The K-10 catalog gets four entries for the one route — month, week, day and list openings — because each opening view is its own lazy chunk.

## Invariants

Every rule below must not change, with the test that pins it. `path:line` is the legacy evidence, verified against the code on 2026-11-11.

### Entry, URL and the opening view

- `defaultView=dashboard` sends `/calendar` to `/calendar/dashboard` unless `?dashboardView`, `?view` or `?date` is present — `src/routes/(calendar)/calendar/+page.server.ts:87-93` · test: `calendarPage.url.rules.test.ts › "a Dashboard default redirects unless the URL says otherwise"`.
- `?date=` seeds the date only when it is a real `YYYY-MM-DD`; `?view=` only for month/week/day/list; an invalid param is ignored, never half-applied — `src/routes/(calendar)/calendar/+page.svelte:89-105` · test: `calendarPage.url.rules.test.ts › "reads only a real date and a known view"`.
- Opening view order: `?view=` › width < 768px → month › last-used view › `defaultView` setting › month. An unmeasurable width counts as wide — `src/lib/components/calendar/calendarView.ts:70-92` · tests: `calendarPage.view.rules.test.ts › "a link beats the width"`, `› "a narrow screen opens on month, whatever was used last (#119)"`.
- Swipe navigation is month-only (a fling pans the week/day grids and scrolls the list); Today stays live but reads as already-current on the period on screen — `calendarView.ts:110-122`, `Calendar.svelte:444-461` · tests: `calendarPage.view.rules.test.ts › "never navigates off month view (week/day pan, list scrolls)"`, `ui/CalendarToolbar.svelte.test.ts › "says where it already is when the period on screen is this one"`.
- `/share-target` 302s to `/calendar?quickadd=<text || title + url>` — `src/routes/share-target/+page.server.ts:5-11` · test: `calendarPage.url.rules.test.ts › "folds text, else the title, then the link"`.

### The bounded month window and the fetched-month cache

- The page load covers ONE month's grid — every cell of the month matrix (five or six week rows), which is the month plus the leading/trailing days either week start needs — not the ±2 year window `expandEventsForUser` falls back to for other callers — `src/lib/server/services/eventDisplayService.ts:53-62`, `+page.server.ts:38-41` · tests: `calendarPage.grid.rules.test.ts › "covers every cell of the month matrix and nothing else"`, `calendarPage.service.db.test.ts › "reads only the visible month's grid window"`.
- Another month is fetched once through the ranged read; the month on screen is the trigger, not the arrow or the picker — `Calendar.svelte:183-247` · test: `calendarPage.range.state.test.ts › "asks for the grid window of the month it shows"`.
- The fetched-month cache holds at most 12 months; the oldest is evicted and becomes refetchable — `Calendar.svelte:195-212` · test: `calendarPage.range.state.test.ts › "evicts the oldest month once twelve are held, and refetches it"`.
- A refetch replaces that month wholesale (so edits and deletes land), and page-load rows win on the same occurrence key `masterId|day` across months — `Calendar.svelte:213-246,289-303` · tests: `› "a refetch replaces the month instead of appending"`, `› "page-load rows win on the same occurrence"`.
- A fetch that started before the page data reloaded is discarded (generation guard); the month on screen keeps drawing until its replacement lands — `Calendar.svelte:213-231,246` · test: `› "drops a fetch that started before the reload"`.
- A failed month load is marked attempted (no hot retry) and toasted `Couldn't load that month's events — try again.` — `Calendar.svelte:262-272` · test: `› "says so in a toast when a month fails to load, and does not retry it"`.
- While a month is being fetched the grid says `Downloading this month…` — `Calendar.svelte:511-517` · test: `ui/CalendarPage.svelte.test.ts › "says Downloading this month while a month is fetched"`.

### Sections, degrade and what the page reads

- Each section degrades to its fallback plus a warning label instead of a 500, and a rejected grid draws `Couldn't load your events.` with Retry — `+page.server.ts:42-47`, `+page.svelte:546-556,603-612` · tests: `calendarPage.service.db.test.ts › "a failing section degrades to its fallback and names itself"`, `ui/CalendarPage.svelte.test.ts › "draws Couldn't load your events with Retry when the grid rejects"`.
- The Daily Verse needs BOTH `showDailyVerse` and the `verse` Dashboard Module; a hidden verse adds no warning and costs no verse read — the switches read is what discovers the module-off case, and turning the setting off skips the call entirely — `src/lib/server/services/calendarData.ts:96-117`, `+page.server.ts:181-200` · tests: `calendarPage.service.db.test.ts › "setting on, module hidden in /account — the reported bug"`, `› "hiding the verse carries no warning"`.
- The guest-merge prompt is only for a registered account with a claimable stash cookie; an Anonymous Account is never sent to `/merge-guest`, and a failing check degrades to "no merge" — `+page.server.ts:49-66` · test: `calendarPage.service.db.test.ts › "an Anonymous Account with a stale stash cookie is not sent to /merge-guest"`.
- The calendar list is the viewer's Personal Calendar first (`Personal Calendar`, settings colour else `#fa8072`) then the family calendar (`families.name` else `Family Calendar`, colour else `#e0ffff`); the personal calendar is provisioned on load — `calendarData.ts:23-58,118-135` · test: `calendarPage.service.db.test.ts › "lists Personal Calendar first, then the family calendar"`.
- Sponsored Events are served only when `showAdsAsEvents` is on, render amber `#f59e0b`, and sit on no calendar — `calendarData.ts:57-92`, `+page.server.ts:181-212` · tests: `calendarPage.service.db.test.ts › "serves no Sponsored Events when the gate is off"`, `calendarPage.calendars.rules.test.ts › "keeps an event that belongs to no calendar (an ad)"`.
- The edit modal's roster keeps first and last names; the task tab offers the viewer's categories when it opens — `+page.server.ts:72-79,98,307` · tests: `calendarPage.service.db.test.ts › "keeps first/last names on the roster"`, `ui/CreateAnythingModal.svelte.test.ts › "loads the viewer's categories when the task tab opens"`.

### Chips, colour and the Key

- Chip colour is the row's own calendar, resolved once per row from its `calendarId` (personal or family), and a row on no calendar takes the sponsored amber — never a colour picked by list position, which is what the legacy `calendarIds.slice(1)` tint got wrong — legacy evidence: `+page.svelte:50,446`; the vocabulary itself is calendar's `chipVocabulary` · test: `ui/CalendarChip.svelte.test.ts › "tints by calendarId, not by list position"`.
- Chips keep one vocabulary — shape = kind (timed dot, all-day bar, task dashed, sponsored hatched bag), colour = calendar, plus RSVP, creator and attendance badges — and the Key renders from that same vocabulary, starting folded — `CalendarKey.svelte:29-70,95-150` · test: `ui/CalendarKeyStrip.svelte.test.ts › "says what shape means, and keeps the key folded until it is asked for"`.

### The reading filters

- One filter rung above every view: hidden calendars → search → hidden people; each narrows the last, and due Tasks ride the same predicates through their `calendarId` — `Calendar.svelte:386-392` · test: `calendarPage.state.test.ts › "applies calendars, then search, then people to events and tasks"`.
- Both filters are device-local reading preferences keyed per user (`familyplanz:hiddenCalendars:<id>`, `familyplanz:hiddenAssignees:<id>`); junk or absent storage means nothing hidden; hiding never writes `defaultCalendarId` — `calendarVisibility.ts:30-96`, `calendarAssignees.ts:230-276` · tests: `calendarPage.calendars.rules.test.ts › "leaves the default-calendar setting alone"`, `calendarPage.people.rules.test.ts › "junk storage means nobody hidden"`.
- A row with no calendar is a Sponsored Event: no calendar or person filter may drop it (hide-all never hides an ad) — `calendarVisibility.ts:79-83`, `calendarAssignees.ts:90-104` · tests: `calendarPage.calendars.rules.test.ts › "keeps an ad through hide-all"`, `calendarPage.people.rules.test.ts › "keeps an ad through a person filter"`.
- Person rows = the loaded family roster ∪ everyone with rows; the viewer is first and named `You`; counts read the already-filtered rows, so a `0` is the reason the grid is empty — `calendarAssignees.ts:170-215` · test: `calendarPage.people.rules.test.ts › "lists a family member with nothing in this window, and says 0"`.
- Search is a reading filter that is never persisted: every typed word must appear in title, description or location (AND); an empty query keeps everything — `calendarSearch.ts:33-49` · test: `calendarPage.search.rules.test.ts › "takes several words, and every one of them has to match"`.
- Three distinct empty states replace the grid, each with one-tap recovery (`Show all calendars`, `Clear search`, `Show everyone`), and the Key is suppressed on all three — `Calendar.svelte:540-660` · test: `ui/CalendarPage.svelte.test.ts › "says so when the filter matches nothing, and clears in one action"`.

### The toolbar and the card

- ONE 80rem card welds the toolbar to the grid, with the Key strip under the grid; the skeleton wears the same card and the same 72/92/104px cells — `Calendar.svelte:467-480`, `+page.svelte:534-546` · test: `ui/CalendarPage.svelte.test.ts › "puts the toolbar and the grid inside ONE card, capped at 80rem"`.
- Toolbar rows: view toggle (Month/Week/List) · one centred date pill (month label, mini month/year picker, prev/next, Today) · Add-mode and Select toggles · Filters with the word and a hidden-count badge · an action strip (Import, Print, Day dashboard, Calendar settings) folding behind a 44px sandwich below `sm`; search is a full-width second row with a visible `⌘K` hint, a `N of M` / `No matches` status and Clear — `CalendarToolbar.svelte:120-160,364-430,511-563` · tests: `ui/CalendarToolbar.svelte.test.ts › "opens on ⌘K and on Ctrl+K — the shortcut still works"`, `› "counts what the other filters left"`.
- Filters is one sheet at every width (the bottom sheet below `sm`, the same sheet centred at 26rem above): grab handle, per-calendar switches wearing the calendar colour, `Hide all`/`Show all`, person rows with avatar + count (`–` when off), `Show everyone`, and footer copy saying it is a reading filter — `CalendarToolbar.svelte:625-790` · test: `ui/CalendarFiltersSheet.svelte.test.ts › "is a bottom sheet below sm and the SAME sheet, centred, from sm up"`.

### Month view

- Month cell: a fixed height (72/92/104px) that clips rather than grows, a weekend wash, a today ring + filled disc, 3 event chips + 2 task chips and `+{n} more`; the per-cell `+` and Day-dashboard links reveal on hover/focus only and are inert while invisible — `MonthDayCell.svelte:50-66,78-160,300-306` · test: `ui/MonthCell.svelte.test.ts › "clips, so a busy Tuesday cannot push the bottom of the month off the screen"`.
- A month-cell tap forks on width and Selection mode: below 768px the day action sheet owns it; at/above, or in Selection mode, Day View — `MonthDays.svelte:112-129` · tests: `ui/MonthCell.svelte.test.ts › "below the floor the mobile sheet owns the tap"`, `› "above the floor a desktop tap opens Day View and never the sheet"`.
- The day action sheet lists the day and its Events, then `Add event`, `Open Day Dashboard` (`?date=`), `View this day's events`, `Open Day View`; a swipe down past 100px dismisses — `DayActionSheet.svelte:20-66,88-160,196-296` · tests: `ui/DayActionSheet.svelte.test.ts › "lists the day and its four actions"`, `› "dismisses on a 100px swipe down"`.
- `+N more` opens the day list of Events and due Tasks; closing it returns a closed state that can reopen — `MonthDays.svelte:72-108` · test: `ui/DayEventsModal.svelte.test.ts › "notifies the parent on Close so +N more can reopen the modal"`.

### Day and week views

- Day/week grids: an empty-slot tap opens create at that minute (15-minute snap); a drag paints a range with `−15` / `+15` / `Create` / dismiss; a long press selects a default hour; Add mode drags with no long press; dropping an Event PUTs it and preserves duration; the day grid autoscrolls to the current hour (07:00 on another day) — `src/lib/utils/eventMove.ts:13-33`, `DayHourGrid.svelte:53-63`, `src/lib/utils/rangeSelect.ts:100-160` · tests: `ui/DayView.svelte.test.ts › "starts a new event at the tapped slot, snapped to 15 minutes"`, `› "moves a dropped event with a PUT preserving duration"`, `calendarPage.select.rules.test.ts › "a long press selects one hour; Add mode drags immediately"`.
- The week all-day band shows all-day chips glyph-only (the band header already says "All day") plus that day's due Tasks; week start honours the setting — `WeekAllDayRow.svelte:38-70`, `WeekView.svelte:37-42` · test: `ui/WeekView.svelte.test.ts › "week start honours the setting"`.
- Day view: Back returns to the previous view; the header shows the date with a Today pill; a day with nothing draws "Nothing scheduled. A free day is a gift — or add something fun." plus Add event; the all-day band names the kind, and the Tasks group shows `🔁 2× Weekly` — `DayHeader.svelte:14-40`, `DayView.svelte:330-352`, `DayAllDayList.svelte:35-118` · tests: `ui/DayView.svelte.test.ts › "returns to the previous view on Back"`, `› "names the kind in the all-day band and the recurrence on a task"`.
- List view groups Events and due Tasks by day under sticky headers, marks today with a pill, and an empty month draws "A whole month of nothing. Suspicious. Add something fun?" — `ListView.svelte:44-118` · test: `ui/ListView.svelte.test.ts › "groups events and due tasks by day, with today marked"`.

### Selection, bulk edit and the modals

- Selection mode: chips toggle instead of opening; Escape leaves it only when no modal is open; a drag inside it asks before leaving (`Exit selection` / `Stay`) — `+page.svelte:175-179`, `DayView.svelte:100-112` · tests: `calendarPage.state.test.ts › "Escape leaves selection only when no modal is open"`, `ui/SelectionExitAsk.svelte.test.ts › "fires onExit and onStay"`.
- Bulk posts `{ ids: [{ id }], op }`; delete is a two-step inline confirm (never `window.confirm`); smart mode is dry-run → review list → apply, and a plan that moves Events into the past needs `Apply anyway`; a server `error` is shown verbatim, default `Hmm, that didn't take. Try again.` — `+page.svelte:190-296`, `BulkEditBar.svelte:118-160` · tests: `ui/BulkEditBar.svelte.test.ts › "arms the delete confirm instead of deleting directly"`, `calendarPage.bulk.state.test.ts › "asks before applying a plan that moves events into the past"`.
- Toasts name what changed: `Hidden <cal> — its events and due tasks are out of every view.` / `Showing <cal> again.` / `All calendars hidden. Tap "Show all" to bring them back.` / `Deleted N event(s).` / `Moved N event(s) to <cal>.` / `Applied N change(s) to your events.` — `Calendar.svelte:330-372`, `+page.svelte:203-225` · tests: `calendarPage.state.test.ts › "toasts what a filter change did"`, `calendarPage.bulk.state.test.ts › "names the count after a bulk apply"`.
- `?edit=<id>` opens the edit modal once rows land (by id or `masterId`) and otherwise shows "Event not found — it may have been deleted, or you don't have access to it."; the param is consumed once — `+page.svelte:506-521` · test: `calendarPage.state.test.ts › "opens the linked event, else the not-found banner"`.
- `?quickadd=` and the share-target params open the create modal pre-parsed in Quick Add, show `Shared text loaded — review and add.`, and strip the params — `+page.svelte:333-356` · test: `ui/CalendarPage.svelte.test.ts › "opens Quick Add pre-parsed from ?quickadd and strips the params"`.
- The create modal's task tab is title (with quick-add help) + Visibility (`Public — family can see it (read-only)` / `Private — only you and the assignee`, a `#public`/`#private` tag in the title winning) + optional Due Date + Category — `EventTaskFields.svelte:38-99` · test: `ui/CreateAnythingModal.svelte.test.ts › "offers visibility, a due date and a category on the task tab"`.
- The first-run card shows only when there is nothing to draw (no Events — Sponsored Events included, owner question 1 — and no due Tasks), links to Smart tasks, and its dismissal persists in `familyplanz:firstRunDismissed` — `+page.svelte:320-326,383-397` · tests: `calendarPage.state.test.ts › "shows the first-run card only for an empty calendar"`, `ui/FirstRunCard.svelte.test.ts › "fires dismiss"`.
- Selecting page text surfaces `Create event from selection`, which seeds Quick Add with the selection and clears it — `+page.svelte:356-372,682-690` · test: `ui/CalendarPage.svelte.test.ts › "offers Create event from selection for a text selection"`.
- The Quick Add FAB hides in Selection mode, where the bulk bar takes its place — `+page.svelte:626-655` · test: `ui/CalendarPage.svelte.test.ts › "hides the Quick Add FAB in Selection mode"`.

## Depends on

- May import: kernel + every domain's public entry (`index.ts` / `index.server.ts` / `ui/index.ts`); never another screen.
- Owns tables: none.
- Reads (join only): none.
- Calls, through each domain's entry:
  - **calendar** — calendars + personal-calendar provisioning, the Event range read (Occurrences with RSVP, attendance and creator name), the client api for range/PUT/DELETE/bulk, `describeRecurrence`, chip vocabulary and `EventChip`/`EventModal`/`EventFormModal`, and the event-move/select math. Why: Events and calendars are that module's concept; this screen only lays them out.
  - **tasks** — due Tasks inside the window, categories on demand, `TaskDetailModal`, quick-add help and the checklist snippet, and the client api. Why: the grid draws due Tasks on their due day, and the create modal's task tab is a tasks form.
  - **sponsored** — the month's Sponsored Events behind their serve gate. Why: the gate is that module's rule, not a screen read of the settings row.
  - **verse** — the Daily Verse, already gated by dashboardModules. Why: the card and its visibility rule are verse's.
  - **dashboardModules** — the one visibility answer (`needs('verse')`): a verse the setting turned off costs no read at all, and while the setting is on one switches read decides whether the verse is shown.
  - **feedback** — report a misparsed phrase from the bulk bar.
  - **shell / app layout** — settings, `familyId` and the roster arrive through `parent()`; the page never re-reads them.
  - **kernel** — `pageLoad`, `localPref`, toasts, `apiClient`, `Sheet`/`ConfirmAction`/`Pill`/`Skeleton`/`DayNav`, time day keys/grouping/formatting/zone, and the ticker.
- Called by: `src/routes/(calendar)/calendar/+page.svelte` (renders `CalendarPage`), `src/routes/(calendar)/calendar/+page.server.ts` (`calendarPageLoad`) and `src/routes/share-target/+page.server.ts` (`shareTargetLoad`) — wiring only.
