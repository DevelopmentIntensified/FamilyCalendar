# 297 — Android clone: Dashboard, Groceries, Alerts (#292 L4)

Status: in-progress

Parent: #292 (spec `docs/specs/android-mobile-clone.md`, §4 lanes). Built test-first (`tdd`); closes with `code-review`.

Blocked by: S1a (done), L0 G1/G7/G8 (done); soft: #295 `EventSheet`, #296 `MentionField` (placeholders until merged)

## Needs doing

- Owns (exclusive): `ui/{dashboard,groceries,alerts}/**`, `data/{DashboardSource,GrocerySource,NotificationSource}.kt`, `push/ActivityNotifier.kt`
- Delivers: §2.3, §2.5, §2.6 (clone of web after 30229da fixes)
- Every `AC-*` for these screens covered by a Robolectric/Compose test; `:app:mobileGate :app:assembleRelease` green; detekt clean; screenshots at 390 dp and 320 dp for owner review.
- Work in progress is pushed to `wip/292-L4-dash` (survives usage limits). Merged to `test` → `main` only when the gate is green.

## Progress

- 2026-11-03: lane started (agent worktree). 2026-11-04 04:57 UTC: hit usage limit, WIP pushed to `wip/292-L4-dash`, resumed.

## Done

