# 118 — Dashboard: the cards are in the wrong layers, and the board is too wide

Status: done — except the calendar half of 1.5, which is one line for whoever
is in `CalendarToolbar.svelte` (see Done).

Source: prototype review round 2, 2026-09-30 — 3 marks on `app-ui/dashboard.html`.

**Blocked by**: None.

## The finding

Three marks, one complaint: the card band does not know what deserves the top
row.

| Mark | Selector | Verbatim |
|---|---|---|
| 1.1 | `[data-fb="mod-board"]` | "This doesn't need to be as wide" |
| 1.2 | `[data-fb="mod-members"]` | "This is uneeded" — **already done, #103** |
| 1.3 | `[data-fb="mod-kids"]` | "bring this to the layer above where the people box was" |
| 1.4 | `[data-fb="mod-meals"]` | "move this up one layer in the grid" |
| 1.5 | `[data-fb="page-head"] … span.daynav` | "make this section like the change requested for the calendar page. make them look the same" |

**1.2 is already shipped** — #103 took the Member Strip off. The prototype still
shows it. That is the stale-prototype problem, not a live defect, and it is why
1.3 says "the layer **where the people box was**": the reviewer is naming a
position by what used to occupy it. The Member Strip was full-width on the top
row, so "the layer above" is unambiguous even though the box is gone.

**1.5 is a consistency mark, not a layout mark.** The dashboard's `daynav` and
the calendar's date navigation should be the same component, or at least the
same rhythm. `104-calendar-width-aware-default-view.md` changed the calendar
side; the dashboard side was not touched.

## Done

### The band is two rows now

`DayDashboard.svelte`, the band rhythm mechanism unchanged — only the
arrangement inside it.

| row | grid | cards |
|---|---|---|
| 1 | `grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3` (`data-testid="dashboard-day-band"`) | Day at a Glance · Top 3 Priorities · Completed Today |
| 2 | `grid items-start gap-4 lg:grid-cols-3` (`data-testid="dashboard-family-row"`) | Family Task Board · Kids' Schedule · Groceries |

- **The board stops being the page.** It was a 876px block and read as the
  layout; it is now one of three columns in the layer the Member Strip vacated.
  Its internal grouping is 101's and is untouched.
- **Kids and Groceries move up a layer each** — out of their own full-width
  blocks below the board, into the two cells beside it. Both are day-scoped and
  small, which is the reviewer's whole point.
- **Row 1 is the full-width band** for what genuinely spans, and it no longer
  has a half-empty column: 103's `md:grid-cols-2` glance/top-3 pairing is kept
  as the 768–1023px tier, and `lg:grid-cols-3` spreads all three above it.
- `items-start` on both rows, so a 173px Completed Today is not stretched to
  the board's height.
- Each row is skipped entirely when nothing in it is visible — an empty grid
  would still cost a 16px gap in a solo account with the family cards switched
  off.
- The page's `{#await}` skeleton was re-cut into the same two rows, so the
  page does not change shape when the data lands.

### One `daynav`

`src/lib/components/DayNav.svelte` — the calendar page's construction (one
pill, members with no ring of their own, 40px), built once.

| prop | type | meaning |
|---|---|---|
| `period` | `'day' \| 'week' \| 'month' \| 'period'` | names the landmark and the arrows |
| `isToday` | `boolean` | `aria-current="date"` + dimmed, not a dead control |
| `todayHref` / `previousHref` / `nextHref` | `string \| null` | render a link |
| `onToday` / `onPrevious` / `onNext` | `(() => void) \| null` | render a button |

Href wins over callback. The dashboard passes hrefs (a day is a URL, and the
link can be opened in a new tab); the calendar passes the callbacks it already
has. "Today" leads, as it does on the calendar page.

**The calendar side is NOT wired — it is a job in progress, not a job done.**
`CalendarToolbar.svelte:116-145` still holds the hand-built cluster. Whoever is
in that file: delete the `<div class="flex items-center overflow-hidden
rounded-xl …">` at **lines 117-145** and replace it with

```svelte
<DayNav period="period" {onToday} {onPrevious} {onNext} />
```

plus `import DayNav from '$lib/components/DayNav.svelte';`. `Calendar.svelte:247-249`
already passes those three callbacks in; nothing else changes.

### The prototype

`prototypes/app-ui/dashboard.html` no longer claims the strip is a live card.
`app-data.js`'s `DASHBOARD_MODULES` no longer carries `memberStrip`, so
`account.html` and `family-detail.html` stop offering a switch for a module the
app retired in #103 — that row is the piece that actually kept mark 1.2 alive.

### Tests

Four new in `DayDashboard.svelte.test.ts` (two rows and not four blocks; the
day band holds the day cards and not the board; the board is one of three
columns with no `col-span`; a hidden card leaves its row and an empty row goes
away), five in `DayNav.svelte.test.ts`, three in a new
`calendar/dashboard/page.svelte.test.ts`. All four were watched red.

`npm run build` green. `npx svelte-check` 49 errors / 42 warnings in 31 files,
against a 48 / 42 / 30 baseline taken before this slice — the one extra error is
in another lane's file, and the only finding in a file this slice touched is
the pre-existing `DayDashboard.svelte.test.ts:158` (103's ancestor walk, not
touched here). `oxlint` clean on all six files.

## Needs doing

- [ ] **Wire the calendar page to `DayNav.svelte`.** `CalendarToolbar.svelte:117-145`.
      Not this slice's file; the recipe is in Done. Until it happens the mark is
      half-answered and the two headers can still drift.
- [ ] **The prototype's grid still reads the round-1 arrangement** — it puts
      kids in row 1 column 3 at 1300px, where the app now uses two even rows.
      The prototype is the proposal and the app is the truth; 121/122 own the
      reconciliation. Left alone here on purpose: re-laying it out would have
      made this slice a prototype redesign.
- [ ] `prototypes/app-ui/app-data.js` also has no `groceries` row, though the
      card shipped in 081. Same lane as the item above, not this one.

## Notes

- 1.2 is recorded here only so the round reconciles. It is not work.
- The band rhythm is already declared once in `DayDashboard.svelte`; this ticket
  changed the arrangement inside it, not the mechanism that renders it.
- `DayDashboard.svelte.test.ts`'s 103 fixture was hoisted to module scope so the
  118 block could use it. No 103 assertion was weakened — the walk and the
  grid count both still hold, because the family row is `lg:grid-cols-3` and
  never `md:grid-cols-2`.
- "One layer above" needed a decision. In the app the Member Strip shared the
  board's row (commit `8357abe`), so "the row the strip vacated" is the board's
  row, and the board can only stop being a banner by sharing it. The prototype's
  reading — kids lifted into row 1 — is a different grid; the two are
  reconciled in the prototype follow-up above.

