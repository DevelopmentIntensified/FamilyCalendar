# 298 — Android clone: Family, Account, Auth (#292 L5a)

Status: in-progress

Parent: #292 (spec `docs/specs/android-mobile-clone.md`, §4 lanes). Built test-first (`tdd`); closes with `code-review`.

Blocked by: S1a (done), L0 G3/G10a–e/G11–G14 (done)

## Needs doing

- Owns (exclusive): `ui/{family,account,auth}/**`, `data/{AccountSource,AuthApi,AuthSource,FamilySource}.kt`
- Delivers: Family, Account/settings, sign-in, signup, forgot/reset password screens (native)
- Every `AC-*` for these screens covered by a Robolectric/Compose test; `:app:mobileGate :app:assembleRelease` green; detekt clean; screenshots at 390 dp and 320 dp for owner review.
- Work in progress is pushed to `wip/292-L5a-account` (survives usage limits). Merged to `test` → `main` only when the gate is green.

## Progress

- 2026-11-03: lane started (agent worktree). 2026-11-04 04:57 UTC: hit usage limit, WIP pushed to `wip/292-L5a-account`, resumed.

## Done

