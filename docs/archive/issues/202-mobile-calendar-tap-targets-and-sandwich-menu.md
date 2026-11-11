# 202 — Mobile calendar: unreadable +3-more, unclickable top-right icon row; wants sandwich menu

Status: in-progress (2026-10-22: unit slice landed, spec residue below)

Source: user bug report, https://www.familyplanz.com/report-bug, 2026-10-22 19:36. Two marks, one concern: mobile tap targets and density on /calendar.
- "…+3 is hard to see and read" — the month-grid overflow chip (MonthDayCell svelte `data-chip-kind` handles already tuned in #119/#120 but no measured size floor).
- "Icons for different calendar actions are small (4 in top right) and hard to click" — the top-right action cluster (new event / today / filters / search switchers); ticket notes they total exactly four controls.
- Directive: "Make them in a sandwich menu in the same place with a modal like with events" — the reporter wants the action cluster collapsed behind a hamburger/pancake row and event-creation invoked via its own modal, per the pattern already in the events modal.

## Done

- Overlap noted: #172 (touch targets below 44px) and #119 (the fold measurement) had the same shape but here we have a DIRECTIVE to collapse the controls into a sandwich row on mobile, not just resize.

## Needs doing

- TDD the mobile action-row collapse: at <=~sm widths, the four top-right controls render inside a single accessible sandwich button that opens the same controls in a sheet/menu anchored top-right; keep desktop placement unchanged.
- Measure + pin chip "…+3 more" as the data-chip-kind 'overflow', same kind as MonthDayCell already uses, at >=18px (font + line-height) and bump to a >=44x32 hit area on mobile (align with #172's measurements) with a name-the-support toast per UI-feedback rules never alert().
- Playwright spec at 360px-wide viewport for both: chip readable, sandwich reachable.

## Landmark (2026-10-22, local, uncommitted)

- Chip DONE: overflow button carries `data-chip-kind="overflow"`, mobile floor
  18px font/leading + 44x32 hit (`min-h-[32px] min-w-[44px]`) + slate-600 ink,
  sm+ word untouched (`sm:text-[11px] sm:text-slate-400`); compact
  chip-flex layout untouched, MonthDayCell.svelte.test.ts green.
- Sandwich DONE (conservative fork, see below): below `sm` the icon strip is
  `hidden sm:flex`; one named 44px `Calendar actions` trigger (`aria-expanded`,
  `aria-haspopup="dialog"`, `sm:hidden`) opens a top-right fixed dialog
  (`CalendarToolbar.svelte`) with the strip's five actions as `min-h-11 w-full`
  rows — Filters (routes into the existing filter sheet), Import, Print,
  Day dashboard, Calendar settings. Escape/backdrop/close dismiss.
  Fopen fork: ticket says "the four controls" but also lists
  "new event / today / filters / search" — moving today/search would break the
  #120 + #119 pins, so the strip's five controls were collapsed instead
  (import/print/dashboard/settings + Filters = reporter's tiny icons).
  Suites: MonthDayCell 32 + CalendarToolbar 54 = 86/86 (new pins: #202
  describe in both files); `npm run check` shows zero diagnostics in the two
  touched files.
- OPEN (residue, not in this slice): (1) the overflow/open sheet toast ack —
  owned by `+page.svelte`'s `onOverflow` handler, which carries another lane's
  uncommitted work and must not be edited from this lane; (2) the 360px
  Playwright spec (chip readable + sandwich reachable at 360px viewport, model
  on `e2e/mobile/MobileSmoke.test.ts`); (3) "event-creation invoked via its own
  modal" — the Add toggle was left top-right on mobile; reassess whether
  range-add belongs on touch at all.
