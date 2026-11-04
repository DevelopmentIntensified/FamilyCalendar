# 295 — Android clone: Calendar (#292 L2)

Status: in-progress

Parent: #292 (spec `docs/specs/android-mobile-clone.md`, §4 lanes). Built test-first (`tdd`); closes with `code-review`.

Blocked by: S1a (done), L0 G2–G7 (done, a0fba80)

## Needs doing

- Owns (exclusive): `ui/calendar/**`, `data/{EventSource,EventDto,QuickParseDto,CalendarSource}.kt`, `domain/{CalendarEvent,EventDraft}.kt`, `ui/calendar/chips/**`
- Delivers: §2.2 month/week/day, event detail/form/day sheet/bulk, public `EventSheet` for #297
- Every `AC-*` for these screens covered by a Robolectric/Compose test; `:app:mobileGate :app:assembleRelease` green; detekt clean; screenshots at 390 dp and 320 dp for owner review.
- Work in progress is pushed to `wip/292-L2-calendar` (survives usage limits). Merged to `test` → `main` only when the gate is green.

## Progress

- 2026-11-03: lane started (agent worktree). 2026-11-04 04:57 UTC: hit usage limit, WIP pushed to `wip/292-L2-calendar`, resumed.

## Done

