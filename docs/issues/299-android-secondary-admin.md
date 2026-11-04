# 299 — Android clone: Stats, Archive, Report a Bug, Import, Print, Admin (#292 L5b)

Status: in-progress

Parent: #292 (spec `docs/specs/android-mobile-clone.md`, §4 lanes). Built test-first (`tdd`); closes with `code-review`.

Blocked by: S1a (done), L0 G15–G19 (done)

## Needs doing

- Owns (exclusive): `ui/secondary/**`, `ui/admin/**`, new `data/{Stats,Archive,BugReport,Import,Print,Admin}Source.kt`
- Delivers: Native versions of the web-only pages: Stats, Archive, Report a Bug, .ics Import, Print, Admin counts/bugs/NLP
- Every `AC-*` for these screens covered by a Robolectric/Compose test; `:app:mobileGate :app:assembleRelease` green; detekt clean; screenshots at 390 dp and 320 dp for owner review.
- Work in progress is pushed to `wip/292-L5b-secondary` (survives usage limits). Merged to `test` → `main` only when the gate is green.

## Progress

- 2026-11-03: lane started (agent worktree). 2026-11-04 04:57 UTC: hit usage limit, WIP pushed to `wip/292-L5b-secondary`, resumed.

## Done

