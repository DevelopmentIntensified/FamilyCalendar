# 294 — Android clone: shell + theme (#292 L1)

Status: in-progress

Parent: #292 (spec `docs/specs/android-mobile-clone.md`, §4 lanes). Built test-first (`tdd`); closes with `code-review`.

Blocked by: S1a (done)

## Needs doing

- Owns (exclusive): `ui/theme/**`, `FpComponents.kt`, `FamilyPlanzHost.kt`, `PhoneTab.kt`, `ui/shell/**`, `ui/nav/**`, `MainActivity.kt`, `FamilyPlanzApp.kt`, `ic_fp_*`, `docs/guides/android-design-tokens.md`
- Delivers: §1 tokens, §2.1 shell (Navbar, MobileMenu, NotificationBell, 6-tab BottomNav, FpToast host, OfflineBanner, BannerStack, FpSheet, Scrim, Motion, FpKicker, chips); start screen follows defaultView, logo → Calendar; native extras kept
- Every `AC-*` for these screens covered by a Robolectric/Compose test; `:app:mobileGate :app:assembleRelease` green; detekt clean; screenshots at 390 dp and 320 dp for owner review.
- Work in progress is pushed to `wip/292-L1-shell` (survives usage limits). Merged to `test` → `main` only when the gate is green.

- Remaining: screenshots at 390 dp / 320 dp (owner review, #130) — the repo has no Android screenshot harness (no Paparazzi/Roborazzi); needs a device/emulator capture.

## Progress

- 2026-11-03: lane started (agent worktree). 2026-11-04 04:57 UTC: hit usage limit, WIP pushed to `wip/292-L1-shell`, resumed.
- 2026-11-04: rebased cleanly onto `origin/test` (the earlier merge kept the substantive side of the three add/add paths: `ShellChromeViewModel.kt`, `ShellSource.kt`, `Motion.kt`; the branch tree was transplanted verbatim, nothing lost).

## Done

- §1 tokens: colour roles (canvas white/slate, wordmark, mint pill, offline / warn / error / success banner tones, notification tones, scrim + slate scrim, account avatar, chip selected/idle, tab + bell badges, toast text/dismiss, kicker, store swatches, calendar defaults), type steps (`FpTitleLargeHeavy`, `FpTitleMediumBold`, `FpMetaText`, `FpMicroText`, `FpBadgeText`, `FpWordmarkText`, `FpKickerText/WideText`), radii (`FpShape.Xs/Rail/SheetTop`), `FpElevation`, `FpMotion`.
- §1.9: `docs/guides/android-design-tokens.md` updated (page canvases, banner/toast/badge rows, elevation, motion, spacing, icons, components); `WebThemeTest` grew four assertions-per-group tests covering every new/fix row.
- §2.1 shell: `FpNavbar` (76 dp), `FpMobileMenu` (200 ms, nav + secondary + admin rows, Logout), `FpNotificationBell` (red-500 badge, loading/failed/empty/rows, Mark all read), `FpBottomNav` (6 tabs in web order, 28 dp pill, 20 dp icon, 11 sp label, primary-600/red-500 badges, hides under a >150 dp IME), `FpBanner` stack (offline, guest, urgent, verify), `FpToaster` + `ToastQueue` (6 s, 4 stacked, action), `FpSheet`, motion specs, `FpKicker`, chip vocabulary.
- Start screen follows `defaultView` (G3 via `SettingsStartRoute`), logo → Calendar tab, native extras (focus, permission banner, reminders) kept.
- AC coverage (Robolectric/Compose or pure): AC-SH-1..21 — `ShellNavUiTest` (1, 9-part, start screen), `ShellNavChromeUiTest` (2, 3, 4, 6, 7, 8, 9, 11), `ShellBannerUiTest` (12, 13, 14, 15, 16, 17, 18, 19, 20), `ShellChromeTest` (2, 3, 5, 10, 13, 14, 15, 16, 17, 18, 19, 21 + badge/test predicates), `WebThemeTest` (§1 tokens).
- Detekt clean again after the size split: `Motion.kt` → `FpMotion.kt`, `FpBanner`/`FpChips` extracted from `FpComponents.kt`, `VerifyChrome` split out of `ShellChromeViewModel`, `MenuState`/`MenuActions` + `BellActions` grouped (reasoned suppression only for the `AppServices` DI seam).
