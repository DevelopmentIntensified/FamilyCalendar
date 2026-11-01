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
2. [DONE 2026-10-31] Session + task read + focus enqueue (per
   `docs/guides/task-api-spec.md`): bearer token storage (DataStore),
   Retrofit 3.0 + OkHttp 5.5.1 + kotlinx-serialization 1.12, GET
   `/api/tasks` list screen, PUT `toggleComplete` via manual JSON patch
   (focusMinutes unconstructible on phone write paths — regression test
   pinned), POST focus start/stop. Settings screen takes a pasted fp_
   token; 401 → token screen. 12 MockWebServer wire-contract tests green;
   assembleDebug green.
   LIVE verified on the WHPX emulator (medium_phone, playstore image):
   throwaway anonymous account bootstrapped via plain curl on
   test.familyplanz.com (Accept text/html → anonymous session; POST
   `/account?/createApiToken` with `x-sveltekit-action: true`), task
   created via Bearer POST — app opened cold (`-S -W`, **TotalTime 3.1s
   on SwiftShader**; real-device budget still the human step —
   structural first frame is network-free), list rendered the row with
   priority/due/assignee meta. Debug-only bootstrap hook for UI checks:
   `adb shell am start ... --es fp_debug_token <fp_...>` (release has no
   hook). NOT driven live: toggle/focus gestures — headless emulator
   `input tap` unreliable (System UI ANR episodes; reader app took
   foreground mid-session); those paths stay proven by the wire tests
   and get re-driven on a stable emulator (snapshot save) or physical
   device in slice 7 (CI). Focus command enqueue vs a real desktop is
   owner-consented work (my throwaway queue expires unread).
3. [DONE 2026-10-31] Calendar read: no server work needed — `GET
   /api/events?from=&to=` existed (issue 082) with the exact page-load
   pipeline (recurring expansion incl. composite occurrence ids,
   exception overrides RSVP/attendance/creator attach, month grid window
   ±7d, strict 62-day window, verbatim 400 text). Native: EventDto +
   `CalendarViewModel`/`CalendarScreen` (bottom-bar tabs Tasks|Calendar,
   month fetch per view, server-day buckets grouped, day view =
   client-side filter on the bucket), month-filter regression test for
   the padded-grid leak + friendlyTime/heading hygiene tests — 24/24
   unit tests, assembleDebug green. LIVE: month screen rendered the
   seeded events (priority/time/location/rsvp/creator all present);
   Prev/Next + Day view gestures still emulator-tap-bound (wire tests
   cover, on-device drive in slice 7). Events cannot be created from the
   phone yet (POST /api/events exists server-side if a create slice is wanted).
4. [DONE f4f966e] Event quick-add: `POST /api/parse-event` phrase -> editable
   draft card (parse is a hint, never a commit); confirm POSTs `/api/events`
   with device-zone offsets (all-day = midnight start, no end). Multi-event
   phrases deferred (one-at-a-time note); 429 AI-cap text surfaced. Parse wire
   contract + draft->request conversion table tests.
5. [DONE bfd5962] Tasks: `GET /api/me` (id + names only) so the phone knows
   who "me" is; Accept/Decline on rows where `assignedTo == me` and status
   pending (PUT manual patch, accepted/declined only; server 403 rule tested);
   rows show assignment + recurrence chips (`recurringLabel` =
   `recurrenceFrequency`). 39 native + 2 server tests.
6. [DONE be1aba7, scoped down] Offline cache: JSON files in `filesDir` per list,
   write-through on success, 401 never reads cache, network error serves last
   sync with an "offline - showing last synced" snack; corrupt/truncated file =
   no cache. Full-refresh reconcile stays the sync contract
   (`docs/guides/task-api-spec.md` "Sync guidance").
   NOT built, by design for now: Room (no KSP line for Kotlin 2.4.x yet);
   `updatedAt` watermark delta sync (`tasks` has no `updated_at` column and
   deletes are hard, so a watermark can't see deletes without a schema
   migration + tombstones; owner call); WorkManager periodic sync (nothing to
   sync in the background until a delta exists).
7. [DONE c8a0786, except human steps] Detekt 1.23.8 (`app/config/detekt.yml`,
   platform idioms relaxed only) + one local gate task `:app:mobileGate` =
   detekt + `testDebugUnitTest` + `assembleDebug` (no hosted CI by #184
   ruling). Play listing draft: `docs/play-store-listing.md`.
   Human steps left: upload signing key, Play Console submission, real-device
   drive of toggle/focus/Prev-Next/Day gestures.
8. [DONE 2026-11-01] `docs/plans/native-android-app-plan.md` gets a superseded
   banner pointing here; its "via Capacitor" stack line corrected.

## Needs doing

- Owner: signing key + Play submission; real-device gesture drive.
- Owner call: delta sync (needs `tasks.updated_at` + tombstones) — or keep full refresh.
- Next phase (not slices 1-8): FCM push, iOS app.

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
