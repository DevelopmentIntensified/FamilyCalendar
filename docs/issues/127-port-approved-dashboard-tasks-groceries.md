# 127 — Port the approved Dashboard, Tasks and Groceries pages, and Prototype E's last mark

Status: in-progress

Source: #123, owner directive 2026-09-30.

**Blocked by**: None. Owns the dashboard band, the tasks surfaces, the grocery
surface, and the calendar's assignee filter.

## The five approved pages

`dashboard.html` · `tasks.html` · `b-tasks-flat.html` · `groceries.html` ·
**Prototype E** (calendar)

## The prior work — this is the most-built ground in the repo

- **#101** grouped the Family Task Board by assignee and flattened the personal
  list, via one shared module. `b-tasks-flat.html` is that prototype and it
  shipped.
- **#096/#097** gave each Store its own colour and replaced two grocery tabs
  with one list plus a scope filter.
- **#118** put the board in a column instead of full-width, moved Kids' and
  Groceries up a layer, and extracted `DayNav`.
- **#119/#120** made the month grid the narrow-screen default, moved search to
  the second toolbar row, and adopted `DayNav` in `CalendarToolbar`. Prototype
  E is approved and its app work shipped in `75263cd`.

**Read those tickets' `## Done` sections before touching anything.** The risk
here is re-implementing finished work or reverting it.

## The one genuinely open mark: By Person as filter buttons

**Mark 1.11 on Prototype E: "unneeded on mobile and should be filter buttons."**

- [x] **A real assignee filter on the calendar**, in the existing Filters sheet
      (below `md`) / popover (above), not a new surface. A filter is a control
      with a value; "By Person" as a card was a reading aid, and as a filter it
      should filter.
- [x] It composes with the existing calendar filters rather than replacing
      them, and with the `?view=` deep link — a filtered month view is still a
      month view.
- [x] Empty state: a filter that matches nothing says so and clears in one
      action. `AGENTS.md`: skeletons, not blank cards.
- [x] Mobile: the mark's premise was that a rail card was the wrong shape on a
      phone. The filter must work at 320px.

## Also in scope

- [x] **Verify the four built pages against their prototypes** and record the
      difference per page. Most match; where the app is better, say so and
      change nothing.
- [x] **`dashboard.html` still shows the round-1 arrangement** — closed, see
      Done.
- [x] **Groceries**: the prototype's note claimed the tabs were shipped — the
      note now says the filter is what shipped.
- [x] Test per closed mark.

## Done

### Mark 1.11 — the person filter is built

New pure module `src/lib/utils/calendarAssignees.ts` (21 tests), shaped exactly
like `calendarVisibility.ts` so the two filters read as siblings:

| piece | what it decides |
|---|---|
| `personOf` (via `eventOwner` / `taskAssignee`) | an **Event** belongs to its `ownerId`; a due **Task** belongs to its `assignedTo`. A row with no person belongs to nobody. |
| `isAdRow` | a row on **no calendar** is a sponsored ad, by `isCalendarHidden`'s own rule. An ad belongs to no person, so no person filter may invent one and drop it — and it is nobody's count. |
| `visibleByAssignee` | the one predicate every view reads; Events and due Tasks together. |
| `assigneeRoster` | the filter's rows: everyone who has something, viewer first then by name. |
| `assigneeCounts` | what each person would keep, as a `Map` — a missing key means zero. |
| `hiddenAssigneeNames` | names for the empty state, skipping ids nothing knows. |
| `assigneeKey` / `parse` / `serialize` / `load` / `save` | `familyplanz:hiddenAssignees:<userId>`, per user **per device**, degrading to "nobody hidden" on junk or a throwing store. |

**It composes.** `Calendar.svelte` now runs three reading filters on one rung —
calendars (#069) → the query (#120) → people (#127) — each narrowing the last,
none replacing another, and the grid is still the last word. `visibleEvents` /
`visibleTasks` are the only arrays any view reads.

**The counts are read from the ALREADY-filtered rows**, so a row falls to `0`
the moment a search or a hidden calendar takes it away, and the roster is built
from the **un**filtered rows so a person never vanishes from their own filter.
A `0` is the reason the grid is empty, said where the filter is.

**Empty state.** A third `data-testid="assignee-empty"` card joins the two that
already exist, and it is last in the chain so each card only ever appears for
its own claim: `calendar-filter-empty` → `search-empty` → `assignee-empty`. It
names who is switched off and clears in one tap (`Show everyone`), from the card
and from the sheet.

**A pin changed, deliberately.** The panel is no longer only calendars, so
`aria-label="Calendars"` became `aria-label="Filters"` (and the trigger's
`aria-label` with it). The one assertion that named it in
`CalendarToolbar.svelte.test.ts` was updated. Nothing else in #069 or #120
moved; the sheet/popover shape test, the dialog role, the backdrop, the Escape
and outside-click closes and the `calendar-filter-all` test all pass unchanged.

**320px.** The rows are one full-width column (`flex flex-col`, no
`grid-cols-` anywhere in the section), `min-h-11`, `truncate` on the name, and
the avatar is the existing `avatarColor` palette — identification, not state.
State is the row's mute and its strike, never a hue, exactly as the calendar
rows do it. Pinned by a test that fails if a column track or a `min-w-[…]`
appears.

**A sponsored event survives.** Pinned, and it is the one rule borrowed
wholesale: `isCalendarHidden` says an event on no calendar is an ad and no
calendar toggle may reach it, so no person filter may either.

### The four pages, one outcome each

| page | outcome | why |
|---|---|---|
| `b-tasks-flat.html` | **matches** | `TasksMainList.svelte` is one continuous run, no band headings and no sticky group header; the jump bar carries `All n · Overdue n · Today n · Up next n · Done n`; `sortFlatTasks` keeps finished work last under every sort key; each row prints its own late chip; "Clear completed" is a list-level control with its two-step confirm. #101 shipped this prototype verbatim — nothing was re-implemented. |
| `tasks.html` | **app is better** | Two differences, both recorded and neither built. (1) The prototype puts a 32px search **on the chip line**; the app has a full-width labelled field on its own row (`TaskToolbar.svelte:51`), which is the same reason #120 put the calendar's search on a second row: a 94px pill at 375px only means something if you already know the shortcut. #121 already ruled on this mark as shipped. (2) The prototype's chips are `Open / Mine / Assigned to me / Done`; the app's are `All / Public / Private / Family` (the 019 scoping vocabulary) and **time** is the jump bar's job after #101. The prototype's labels are a scannability sketch, not a spec. Its own thesis — the assignment inbox as a distinct band — is met by `AssignmentsCard.svelte`. |
| `groceries.html` | **matches** (after the note) | Store grouping, per-store colours, the summary line, the row chips, the checked-off rail and the row actions all match #096/#074. The only difference was the page's own prose, fixed below. |
| `dashboard.html` | **real difference — now built** | The prototype still showed the round-1 arrangement. Fixed below. |

### The two stale prototype notes

- **`prototypes/app-ui/dashboard.html` no longer shows the round-1 grid.** It
  was one `3`-column grid with `.dash-lift` placing Kids' Schedule by hand into
  row 1 column 3. It is now **two rows in two grids**, which is what #118
  shipped: row 1 is the day's own reading across the full width
  (`md:grid-cols-2` → `lg:grid-cols-3`, so 103's pinned glance/top-3 pairing is
  still there), row 2 is the small family cards three-up (`lg:grid-cols-3`,
  never two-up). `grid-column`, `grid-row` and `dash-lift` are **gone**, because
  a card placed by hand is a card that can leave a hole. Each row is skipped
  when it is empty, as the app skips it, and the three `data-testid`s
  (`dashboard-card-band`, `dashboard-day-band`, `dashboard-family-row`) now
  exist on the prototype too. The note block records the move and why; the lede
  says the band is two rows.
- **`prototypes/app-ui/groceries.html` no longer claims the tabs are shipped.**
  Its `thesis` and `realPage` both said "the shipped tabs, and one list behind a
  scope filter" and its hint said "Proposed, not shipped". All of it now says
  the opposite: **#097 shipped the filter** — the `role="tablist"` is gone,
  single-select `aria-pressed` chips over ONE list, default `All`, `?scope=mine`
  still lands on Mine — and the tabs are labelled "retired" and kept only so
  the difference is visible. That was the claim the next reviewer would have
  marked a third time.

### Verified, not rebuilt

`DayDashboard.svelte` was **not** touched. The #103/#118 pins in
`DayDashboard.svelte.test.ts` — the glance/top-3 pairing, the grid-count
assertion and the ancestor walk that finds no `md:grid-cols-2` on the family
row — are all still green, and the band they describe is what the prototype now
copies.

## Tests

- 21 new in `src/lib/utils/calendarAssignees.test.ts` (watched red first).
- 9 new in `CalendarToolbar.svelte.test.ts` — the same panel as the calendars,
  a toggle row with its own state, counts that say `0` rather than hiding the
  row, off-by-mute-not-hue, `Show everyone` only while somebody is off, the
  320px shape, a roster that says so when it is empty, a trigger that exists
  for a person filter alone, and one badge counting both axes.
- 10 new in `Calendar.svelte.test.ts` — events **and** due tasks drop together,
  an ad is never reached, the calendar filter still composes, search still
  composes and the counts follow, the empty state names the person and clears
  in one tap and does not steal the other two states, reload + per-user
  isolation, `?view=` still wins and the filter does not change the view, a
  toast per switch, and its own storage key beside the calendar one.
- `npx vitest run` over `src/lib/components/calendar/`,
  `src/lib/components/dashboard/`, `src/lib/components/tasks/`,
  `src/lib/utils/calendarAssignees.test.ts` and `src/routes/(calendar)/calendar/`:
  **80 files, 681 tests, all passing.**

## Verification, as run

- `npx vitest run` (the five paths above) — **681 passed / 80 files**.
- `npx svelte-check` — **44 errors / 42 warnings in 33 files**. **No finding in
  any file this slice touched** (`calendarAssignees.ts` and its test,
  `Calendar.svelte`, `CalendarToolbar.svelte` and both tests). The 33 files are
  other lanes' in-flight work plus the pre-existing `DayDashboard.svelte.test.ts`
  finding #118 already recorded; the count is not comparable to #118's 48/42/31
  because other agents are in the tree.
- `npx oxlint` on the five source files — **exit 0, clean**.
  `Calendar.svelte.test.ts` has 2 findings, both pre-existing (`:17` the `evt`
  factory's `as Event`, `:49` the old `setup(over: Record<string, unknown>)`);
  the new fixture in this slice uses a named `PeopleOverrides` and adds none.
- `npm run build` — **exit 0**. (An earlier run failed with a missing
  `.svelte-kit/output/server/internal.js`; that was a race against my own
  concurrent `svelte-check`/`vitest` runs, and it has not reproduced.)
- `npm run proto:check` — 15 of 17 suites green. The 2 red are
  `app-ui/app-check.mjs` (`adConsentRecords` in `schema.ts` but not in the
  prototype's model reference; `feedback.js` drifted from the skill asset) and
  `calendar-ui/feedback-e2e.mjs` (a Node crash) — all three findings pre-exist
  this slice, are in files this slice did not touch, and
  `render-check.mjs`, `serve-check.mjs`, `spacing-check.mjs`, `lint.mjs`,
  `tree-check.mjs` and `review-check.mjs` are all clean on the two prototypes
  that were edited.

## Notes

- **The roster is the people who have something, not the family roster**, and
  that is a decision, not an omission. `Calendar.svelte` is handed the loaded
  rows and nothing else — reading `$page.data.familyMembers` inside the
  component would break every existing test (the `$app/stores` subscription
  only exists inside a running SvelteKit app, which is why `BottomNav` needs a
  `currentPath` test seam) and passing the roster in would mean editing
  `src/routes/(calendar)/calendar/+page.svelte`, which this slice does not own.
  So the filter's rows are exactly the people whose plans are on this calendar.
  That is also the honest shape for a *filter*: a person with nothing here has
  nothing to switch on or off, and a card of every member is what #103 deleted.
- **Names come from the data, and the label admits when there are none.** A
  task's `assigneeFirstName` is the richer source (any scope); an event's
  `creatorName` is attached to FAMILY events only, so a member whose only rows
  are personal-calendar events arrives unnamed and is labelled `A member`. The
  row still earns its place — otherwise their plans could never be switched
  back on — and the label does not guess at a name.
- **`searchTotal` moved.** It was `countMatches(visibleEvents, q)`, which was
  redundant with a re-filter of already-filtered data; it is now the number of
  rows the other filters allow, and `searchMatches` is what is left of them. A
  person filter therefore moves `N` and never `M` — which is the honest report.
  #120's pinned `1 of 5` still holds.
- **A third key exists in localStorage**: `familyplanz:hiddenAssignees:<user>`,
  beside `familyplanz:hiddenCalendars:<user>` and never on top of it. Pinned.
  Nothing was persisted before it is toggled, and a stale id is a no-op by
  construction (a hidden id nobody has hides nothing).
- **The words "by person" are deliberately absent from the shipped copy.** The
  section is `Assignee`, and `Calendar.svelte.test.ts`'s #119 pin asserts that
  `/by person/i` matches nothing at any width, because the rail card must not
  come back under a filter's name.

## Needs doing

- [ ] **#115's flagged bug is CONFIRMED, and it is one line worse than filed.**
      `groceries/+page.svelte:60` keys `colourOverrides` by **storeKey alone**,
      and `:96-104` rebuilds each override row's `familyId` from the page's
      *current* `colourScope` control rather than from the scope the write was
      made for. So: a personal colour followed by a family colour for the same
      store overwrites the personal entry (the bug #115 suspected), **and**
      merely flipping the "Everyone / Just me" switch re-labels an existing
      override as the other scope, so the colour silently changes scope in the
      UI before any write happens. Fix is `colourOverrides` keyed by
      `` `${scope}:${storeKey}` `` with the scope captured at write time. Not
      done here: that page is not this slice's file, and #115 owns the ticket.
- [ ] **`review.json` still records nothing new for these four pages.** The
      registry entries already carry a destination for each, and #123 owns the
      reconciliation; this slice changed no state there.
- [ ] **`prototypes/app-ui/app-data.js` has no `groceries` row**, though the
      card shipped in 081. Shared file, other lanes; #118 left the same item.
