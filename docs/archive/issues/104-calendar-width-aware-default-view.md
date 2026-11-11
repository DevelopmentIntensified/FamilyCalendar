# 104 — Calendar: the opening view does not know how wide the screen is

Status: done (one open question in "Needs doing" — the settings default vs the width)

Source: `calendar-ui/d-working-calendar.html` review, nine marks converging on
one complaint — on a phone the rail takes over and the calendar disappears.
Residue after checking what the app actually renders.

**Blocked by:** None (can start immediately).

## Done

### The one named width rule

`VIEW_BREAKPOINT_PX = 768` in `src/lib/components/calendar/calendarView.ts`,
with `resolveCalendarLayout(width)` naming the two tiers. 768 is Tailwind's
`md`, so the number the JS reads and the number the stylesheets use are the
same one.

| width        | tier     | what it means                                              |
| ------------ | -------- | ---------------------------------------------------------- |
| `< 768px`    | `narrow` | a phone: the month grid opens. One day at a time, full width, is the "calendar disappeared" experience |
| `>= 768px`   | `wide`   | room for the day grid's hour gutter and a real column, so the settings default is a legitimate opening |
| not a number | `wide`   | SSR has no `window`, and 0/NaN is a broken reading. Never a reason to change what a user sees |

Tiers are named for what the width **is**, not the device it usually arrives
on: a 768px tablet and a 768px browser window are the same layout problem.

### The resolution order

`resolveInitialView(initialView, defaultViewSetting, storedView, width?)` —
still one pure function, width as one more input:

1. an explicit `?view=` link
2. the last view the user actually used (`familyplanz:lastView`)
3. **the width** (new)
4. the settings default (`defaultView`)
5. `month`

The width sits **below** both inputs that mean "the user chose this", so a
phone is never a reason to overrule a stated preference. It sits **above** the
settings default — which is the whole fix: `defaultView` ships as `dayView`
(`schema.ts:76`), so a first-time phone user used to land on the day view with
no way to see the month they were in.

The width is read **once**, next to the existing `lastView` read in
`Calendar.svelte`, at the one place the opening view is decided. Resizing
never re-runs it: a phone is a reason to pick an opening, not to move
somebody who is already looking at a view.

### Tests — 16 in `calendarView.test.ts` (7 pre-existing, all still green)

The rule itself, at every tier and both edges of the boundary: 320 / 375 /
414 / 430 / 767 → `narrow`; 768 / 834 / 1024 / 1440 → `wide`; plus
`null` / `undefined` / 0 / -1 / NaN / Infinity → `wide`. The whole order, with
a stored view beating the width at **4 views x 6 widths**, a link beating the
width, no stored view falling to month at 320/375/767 and to the setting at
768/1440, an unusable stored value not counting as a preference, and an
unknown width changing nothing at all.

### Verified in a real browser

Dev server + Chromium, one account, viewport as the only variable:

| asked | innerWidth | opens   | scrollWidth | clientWidth | page errors |
| ----- | ---------- | ------- | ----------- | ----------- | ----------- |
| 320   | 320        | month   | 320         | 320         | 0           |
| 375   | 375        | month   | 375         | 375         | 0           |
| 414   | 414        | month   | 414         | 414         | 0           |
| 767   | 767        | month   | 767         | 767         | 0           |
| 768   | 768        | not month | 768       | 768         | 0           |
| 834   | 834        | not month | 834       | 834         | 0           |
| 1024  | 1024       | not month | 1024      | 1024        | 0           |
| 1440  | 1440       | not month | 1440      | 1440        | 0           |

The boundary flips exactly between 767 and 768, and `scrollWidth ==
clientWidth` at every width — **zero horizontal page overflow, 320px included**.

### The load window did not widen

No fetch, no promise, no stream, no new prop off `calendarData`. The width is
a read of `window.innerWidth` in the component that was already choosing the
view, in the same tick as the `lastView` read that was already there. The
resolution is the same pure function with one more scalar argument. #041's
streamed `calendarData`, #043's `Promise.all` wave, and the lazy
`EventFormModal` chunk are all untouched, so #082's load contract still owns
the same window.

## Needs doing

- [ ] **The settings default vs the width.** Deliberate split, flagged for
      review. `defaultView` is a standing preference the user sets in
      `/account#calendar`; a last-used view is a per-visit choice. The width
      outranks the former and is outranked by the latter, so a user who set
      `defaultView: week` and then opens the app on a phone gets month, and
      the first tap of a view button (`changeView` writes `lastView`) puts
      them back where they asked to be, on every screen size. This is what
      makes the ticket's own test spec — "no stored view falling to month on a
      narrow screen and to the setting on a wide one" — actually fix the
      complaint. The alternative reading, "the chosen setting still wins",
      makes the whole ticket a no-op for a fresh account, which is the
      majority case it exists to serve. Needs a ruling.

## Notes

### What the reviewer asked for that the app does not have

Checked against the code, not the prototype. All four "it shouldn't be on
mobile" marks are about a rail **the app never built**. The calendar page
renders one thing: `CalendarToolbar` then exactly one of Month/Week/Day/List
(`Calendar.svelte:223-370`). There is no rail, no mini month, no overdue card,
no up-next, no by-person card — at any width. So there is nothing to relocate
and nothing a rail could have displaced. The destinations below are where each
of those ideas already lives on a phone.

| reviewer's mark                  | where it is on mobile today                                                        | why |
| -------------------------------- | --------------------------------------------------------------------------------- | --- |
| "overdue shouldn't be on mobile" | nothing to move. Due tasks ride **inside** each view (`dueTasks` -> `MonthDays`/`WeekView`/`DayView`/`ListView`, `Calendar.svelte:330,344,357,367`), and the full list is the **Tasks** tab (`navItems.ts:48-52`) | the mark was against a rail card that does not exist; on the calendar a task has to sit on the date it is due |
| "up next should be dashboard"    | already dashboard-only. The **Dashboard** tab (`navItems.ts:43-47`) plus a day-dashboard button in the toolbar (`CalendarToolbar.svelte:318-327`) | never was a calendar-page card; nothing to move |
| "by person should be filter buttons" | no by-person card exists. Grouping by person is the Family Task Board's job (grouped by assignee, `CONTEXT.md` Family Task Board). The calendar's own filter is already a set of toggle buttons — by **calendar** (`CalendarToolbar.svelte:267-293`) | building a by-person filter is new work on a page that never had the problem |
| "calendar filters should open from a button" | already exactly that, at every width: one button in the toolbar strip opens a popover, outside-click and Escape close it, `max-w-[calc(100vw-2rem)]` so it fits 320px (`CalendarToolbar.svelte:267-293, 347-413`) | already true |
| "the circle is really big on tablet" | no circle, and no mini month. The only mini is a month/year **popover** from the "September 2026" button (`CalendarToolbar.svelte:148-199`) | the prototype's rail card, never built |
| "tablet wants the cal view, not the micro cal view" | already true: a tablet gets the real calendar, and the popover is a picker that closes on selection, not a permanent card | already true |

### Two pre-existing items this change did not introduce

- The prev/next hover arrows (`Calendar.svelte:260-277`) are `absolute -left-1`
  / `-right-1`, so their boxes sit 4px outside the viewport at `>= 640px`.
  `scrollWidth == clientWidth`, so they create no scrollbar and no page
  overflow. Not a phone concern, and not touched.
- Week view on a phone is a deliberate horizontal scroller
  (`min-w-[700px]` below `sm`). It overflows its own container, not the page.
  This rule makes it a deliberate choice instead of a phone's opening view.

### Housekeeping

- `npm run build` and `npm run check` **cannot currently run in the working
  tree** — two other agents' in-flight files break them, both outside this
  ticket: `src/routes/(calendar)/calendar/groceries/+page.svelte:536` has a
  `{@const}` inside a `<p>` (`const_tag_invalid_placement`), and the
  repo-wide suite is flaky under load because sibling agents run vitest at the
  same time. Verified instead by: 16/16 in `calendarView.test.ts`; 279/279
  across `src/lib/components/calendar` + `src/lib/utils` in isolation; zero
  `tsc` and zero `svelte-check` findings in the three files touched; and a full
  Vite build (client 418 modules + SSR 533 modules, both `built in`) of a
  throwaway copy of the tree outside the repo with those two sibling files
  patched. The only error left there was `adapter-vercel` symlinking a
  junctioned `node_modules`, which is an artifact of the copy.
- Do **not** read the approval of the prototype as a mandate to build its
  rail. If the rail ever comes back, its mobile behaviour is a separate
  decision from this one.
- Three of the reviewer's other marks are about the toolbar's arrangement and
  the day's key, and are not this ticket. One of them ("events are only shifted
  if they overlap") contradicts a shipped decision in 066.
