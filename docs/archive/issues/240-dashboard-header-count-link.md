# 240 — Dashboard: Family Task Board count and Today empty-state link mislabelled

Status: done

Source: repo bug audit 2026-11-01 (lane D).

## Evidence

`FamilyTaskBoardCard.svelte:172` shows `glance.openToday` (viewer's due-today) as board open count; `TodayGlanceCard.svelte:140` `href="/calendar?view=day"` ignores viewed date.

## Repro

Board lists 8, header says '2 open'; dashboard for Nov 5 -> 'Open day view' lands on today.

## Done

- Confirmed real (both halves).
- `FamilyTaskBoardCard` header now shows `openTotal` (= the board's open rows); the misleading `openToday` prop removed (and its pass-through dropped from `DayDashboard` + prototype `VariantMorningRead`/`VariantFocusFirst`).
- `TodayGlanceCard` takes `dayDate` (`YYYY-MM-DD`); empty-state link = `/calendar?date=<day>&view=day` (bare `/calendar?view=day` when absent/invalid). `DayDashboard` takes `dayDate` and forwards it. `/calendar` already seeds `currentDate` from `?date=` and the view from `?view=`.
- Red→green: `FamilyTaskBoardCard.svelte.test.ts` (3 rows → "3 open"), `TodayGlanceCard.svelte.test.ts` (dated link), `DayDashboard.svelte.test.ts` (forwards dayDate; board header = familyTasks count, not glance.openToday). 94/94 dashboard component tests pass.
- Wiring left for the `dashboard/+page.svelte` owner (outside this lane): pass `dayDate={dayDt.toISODate()}` to `<DayDashboard>`. Until then the link falls back to today (the old behaviour).

## Needs doing

(none)
