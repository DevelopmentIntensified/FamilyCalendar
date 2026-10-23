# 202 — Mobile calendar: unreadable +3-more, unclickable top-right icon row; wants sandwich menu

Status: open

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
