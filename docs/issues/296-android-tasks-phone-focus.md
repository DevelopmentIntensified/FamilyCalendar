# 296 — Android clone: Tasks + phone focus sessions (#292 L3, #293)

Status: in-progress

Parent: #292 (spec `docs/specs/android-mobile-clone.md`, §4 lanes). Built test-first (`tdd`); closes with `code-review`.

Blocked by: S1a (done), L0 G4/G9 (done), #293 server (done, live)

## Needs doing

- Owns (exclusive): `ui/tasks/**`, `TasksViewModel`, `data/{TaskApi,TaskSource,TaskDto,TaskCache,TaskRepository,TaskCategorySource}.kt`, `domain/{Task,FocusTime}.kt`, `domain/tasks/**`
- Delivers: §2.4 Tasks; public `TaskRowCompact` + `MentionField`; #293 Android: Focus here / Stop, 409 adopts openSessionId, offline retry queue, phone minutes shown
- Every `AC-*` for these screens covered by a Robolectric/Compose test; `:app:mobileGate :app:assembleRelease` green; detekt clean; screenshots at 390 dp and 320 dp for owner review.
- Work in progress is pushed to `wip/292-L3-tasks` (survives usage limits). Merged to `test` → `main` only when the gate is green.

## Progress

- 2026-11-03: lane started (agent worktree). 2026-11-04 04:57 UTC: hit usage limit, WIP pushed to `wip/292-L3-tasks`, resumed.

## Done

