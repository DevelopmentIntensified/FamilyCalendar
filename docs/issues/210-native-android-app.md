# 210 — Native Android app (Kotlin + Compose), then iOS later

Status: in-progress

Owner call 2026-10-27: drop the Capacitor wrap (#209); build a real native
Android app first, Apple (Swift) after. App reuses package id
`com.familyplanz.app` (was the wrap's appId — same identity continuity).

## Stack decisions

- Kotlin + Jetpack Compose + Material 3, `apps/android/` in this repo
  (skills: `kotlin-android` rules apply — detekt, file ≤300 lines, no
  `Any?`/Map bags in public APIs, fakes over trivial unit tests).
- Room for local cache; WorkManager for scheduled sync.
- Network: Retrofit + OkHttp + kotlinx-serialization against new JSON
  endpoints on the existing SvelteKit app (server actions are post-form,
  not consumable from native).
- Auth: reuses Anonymous Account / Claiming / Magic Link domain. Native
  opens magic links via app links (`https://familyplanz.com/claim/verify/...`
  and signup verify routes) — assetlinks.json goes on the site.
- Push: FCM after core sync works (web-push VAPID does not reach FCM;
  needs a send-side abstraction in pushService.ts).
- iOS: separate Swift/SwiftUI app once Android core is shipped — not a
  cross-platform wrapper.

## Slices

1. Toolchain + scaffold: gradle wrapper, AGP/Kotlin/Compose BOM current
   stable, app boots (empty Compose shell) — assembleDebug green.
2. Session/account bootstrap against `/api`: anonymous account create +
   session persistence (secure storage), claim deep link.
3. Calendar read: events for window (existing `/api` shape), month + day
   views. Reuse server date logic; native does rendering only.
4. Event quick-add + guidance parse via `/api/parse-event`.
5. Tasks: lists, complete/assign handoff flows, recurring cursor display.
6. Room cache + delta sync (updatedAt watermark, per archive plan ideas).
7. Detekt + CI assemble gate; then Play listing (signing key = human step).
8. Stale `docs/plans/native-android-app-plan.md` (says "via Capacitor") —
   replace with this issue as the authoritative plan.

## Needs doing

- Slice 1 beyond toolchain below.
- API endpoints list per slice as backend side lands.

## Toolchain (2026-10-27)

- Machine was bare: only Java 25 installed, no Android Studio, `Sdk/` dir
  empty of cmdline-tools contents. Plan: WinGet Temurin 21 (AGP-supported
  LTS), commandline-tools zip into `%LOCALAPPDATA%\Android\Sdk`, sdkmanager
  licenses + `platform-tools` + `platforms;android-3x` + `build-tools`.
- `local.properties` (`sdk.dir`) is machine-local: stays uncommitted.
