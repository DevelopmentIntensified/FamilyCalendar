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

1. [DONE 2026-10-27] Toolchain + scaffold: gradle wrapper 9.6.0, AGP 9.4.0,
   Kotlin (built-in, AGP 9 runtime KGP 2.2.10+ w/ compose-compiler plugin
   2.4.21), compose BOM 2026.09.00, `:app:assembleDebug` green (36 tasks,
   `app-debug.apk` exists). Temurin 21 JDK + cmdline-tools 16111833 into
   `%LOCALAPPDATA%\Android\Sdk`; platform android-37.0 (compileSdk 37 is
   required by Compose 1.12), targetSdk 36, minSdk 26, build-tools 36.0.0.
   `local.properties` (sdk.dir) written, gitignored. On-device boot smoke = human step (no emulator/device attached this session).
2. [DONE 2026-10-29, tests-only pending live smoke] Session + task read +
   focus enqueue (per `docs/guides/task-api-spec.md`): bearer token storage
   (DataStore), Retrofit 3.0 + OkHttp 5.5.1 + kotlinx-serialization 1.12,
   GET `/api/tasks` list screen, PUT `toggleComplete` via manual JSON patch
   (focusMinutes unconstructible on phone write paths — regression test
   pinned), POST focus start/stop. Settings screen takes a pasted fp_ token;
   401 → token screen. 12 wire-contract tests (MockWebServer) green;
   assembleDebug green. LIVE device smoke vs test env pending owner token
   (paste path in-app; focus start would enqueue on the owner desktop on
   purpose). Emulator: medium-phone AVD (google_apis_playstore x86_64-36),
   WHPX accel, fp-emulator headless service; prior instance died once under
   concurrent Gradle RAM pressure — relaunch clean.
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
  empty. Now: WinGet Temurin 21 (AGP runs on JDK 17+, Gradle daemon on 21),
  cmd-tools `commandlinetools-win-16111833_latest.zip` →
  `%LOCALAPPDATA%\Android\Sdk`, licenses auto-accepted, `platform-tools` +
  `platforms;android-37.0` + `build-tools;36.0.0` installed. Gradle dist
  9.6.0 at `%LOCALAPPDATA%\gradle-dist`.
- AGP 9 gotcha hit: `org.jetbrains.kotlin.android` plugin now FAILS to
  apply (built-in Kotlin since AGP 9.0) — removed; compose-compiler plugin
  (`org.jetbrains.kotlin.plugin.compose` 2.4.21) remains; `kotlin {}`
  compilerOptions DSL still valid.
- `local.properties` (`sdk.dir`) is machine-local: stays uncommitted.
- Gradle invocation quirk on this box: `gradle.bat`/`cmd //c gradlew.bat`
  wreck JAVA_HOME quoting; working invocation is
  `java -cp gradle/wrapper/gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain :app:assembleDebug` from `apps/android/`.
