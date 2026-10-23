# 205 - Desktop date-tap opens the mobile day sheet, blocking the selection tool

Status: done

Source: owner bug report 2026-10-22 - "seems like the mobile model and mobile clicking on a date is happening on pc. I can't use the selection tool because of this."

## Done

- Defect confirmed in the tree: `MonthDayCell.svelte` overlay button calls `onCellTap`, and `MonthDays.svelte:95 handleCellTap` opens `DayActionSheet` with no width or pointer check. That is #145's 2026-10-04 ruling ("a day tap opens the sheet at EVERY width") doing exactly what it says - and the owner now calls it a bug on PC. The ruling is reversed: this ticket supersedes the every-width clause of #145.
- Effect: on desktop, entering Select mode in the toolbar and pressing a month-cell date opens the mobile action sheet instead of letting the drag/range select or day navigation do its job. The month view never reaches the desktop-native tap answers.

## Done

- Owner answers recorded 2026-10-22: desktop tap = open Day View (pre-#145 behaviour); fork key = viewport width + Selection mode, COMBINED; sheet suppressed in Selection mode at EVERY width (touch included, so mobile users keep the selection tool).
- `MonthDays.svelte:95 handleCellTap` now forks on `selectionMode || matchMedia('(min-width: \$VIEW_BREAKPOINT_PX px)')`: below the floor a plain tap opens the DayActionSheet exactly as before; above the floor, or in Selection mode at any width, the tap routes to `openDay(cellDate)` (Day View). One breakpoint constant reused (`calendarView.ts:35`, #128's md = 768) — no second width number, no new matchMedia helper.
- `openDay` was already wired end-to-end (Calendar.svelte:152 → MonthView → MonthDays); no un-wired seam found, no behaviour invented.
- Mobile path untouched: sheet, PWA, #119 rail, #202 hamburger unchanged (below-floor test passes untouched).
- TDD red-green in `MonthDays.svelte.test.ts`: the #145 "every width" describe rewritten (not deleted) to 3 cases — below-floor sheet (openDay untouched), above-floor Day View (sheet never opens), Selection mode at BOTH widths → Day View. Overflow reopen-after-close regression kept. Red evidence: 3 failed | 2 passed before the fork; green: 5/5 MonthDays, 76/76 MonthDayCell + Calendar.svelte.

## Needs doing

(none — closed 2026-10-23)
