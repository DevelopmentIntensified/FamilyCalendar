# 205 - Desktop date-tap opens the mobile day sheet, blocking the selection tool

Status: open

Source: owner bug report 2026-10-22 - "seems like the mobile model and mobile clicking on a date is happening on pc. I can't use the selection tool because of this."

## Done

- Defect confirmed in the tree: `MonthDayCell.svelte` overlay button calls `onCellTap`, and `MonthDays.svelte:95 handleCellTap` opens `DayActionSheet` with no width or pointer check. That is #145's 2026-10-04 ruling ("a day tap opens the sheet at EVERY width") doing exactly what it says - and the owner now calls it a bug on PC. The ruling is reversed: this ticket supersedes the every-width clause of #145.
- Effect: on desktop, entering Select mode in the toolbar and pressing a month-cell date opens the mobile action sheet instead of letting the drag/range select or day navigation do its job. The month view never reaches the desktop-native tap answers.

## Needs doing

- Restore a desktop-native date-tap answer in month view: on a fine pointer (or explicitly NOT selection-mod... owner to confirm the exact fork), a plain desktop date-tap must not open the mobile sheet. Open questions before implementation:
  - what does a desktop date-tap do instead: open the day view directly (pre-#145 behaviour), or nothing but selection?
  - fork key: viewport width, pointer type (`matchMedia('(pointer: fine)')`), or both?
  - does the sheet stay for touch at every width, or only under a width floor?
- Holiday: the sheet must keep working on a phone (#202's marks + #119 rail context), and the PWA must not regress `#145`'s mobile sheet tests - those pins in `MonthDays.svelte.test.ts` ("a day tap opens the sheet at every width") are expected to be red, rewritten to the new fork rather than deleted.
- TDD red-green; record the owner's answers above before building.
