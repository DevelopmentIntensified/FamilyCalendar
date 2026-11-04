# 294 — Android clone: shell + theme (#292 L1)

Status: in-progress

Parent: #292 (spec `docs/specs/android-mobile-clone.md`, §4 lanes). Built test-first (`tdd`); closes with `code-review`.

Blocked by: S1a (done)

## Needs doing

- Owns (exclusive): `ui/theme/**`, `FpComponents.kt`, `FamilyPlanzHost.kt`, `PhoneTab.kt`, `ui/shell/**`, `ui/nav/**`, `MainActivity.kt`, `FamilyPlanzApp.kt`, `ic_fp_*`, `docs/guides/android-design-tokens.md`
- Delivers: §1 tokens, §2.1 shell (Navbar, MobileMenu, NotificationBell, 6-tab BottomNav, FpToast host, OfflineBanner, BannerStack, FpSheet, Scrim, Motion, FpKicker, chips); start screen follows defaultView, logo → Calendar; native extras kept
- Every `AC-*` for these screens covered by a Robolectric/Compose test; `:app:mobileGate :app:assembleRelease` green; detekt clean; screenshots at 390 dp and 320 dp for owner review.
- Work in progress is pushed to `wip/292-L1-shell` (survives usage limits). Merged to `test` → `main` only when the gate is green.

## Progress

- 2026-11-03: lane started (agent worktree). 2026-11-04 04:57 UTC: hit usage limit, WIP pushed to `wip/292-L1-shell`, resumed.

## Done

