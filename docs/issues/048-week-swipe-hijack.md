# 048 — Week-view horizontal scroll hijacked by week navigation

Status: open

## Done

- Filed from bug export 2026-09-10 ("Scrolling side to side on week view should not go to next week").

## Needs doing

- Culprit: `src/lib/components/calendar/Calendar.svelte:115-132` — `ontouchstart/ontouchend` on the whole calendar container; any horizontal fling (|dx|>60, |dx|>|dy|*1.5) calls goNext/goPrevious. Week-view hour grid needs horizontal panning (day columns overflow), so every pan flips the week.
- Fix: scope swipe-nav to month view only (or non-scrollable header), OR require edge-swipe / larger threshold in week/day, OR set `touch-action: pan-x pan-y` on week grid so panning never bubbles to nav. Record choice here.
- Regression test: horizontal pan inside WeekView grid must not call goNext/goPrevious; month-view fling still navigates (existing Calendar tests fence).
- Per slice: colocated vitest + oxlint + prettier + build green, push test immediately.
