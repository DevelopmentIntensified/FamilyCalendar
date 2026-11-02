# 273 — Android: receive FCM pushes (register token, show notifications)

Status: done

Source: owner call 2026-11-02 (Firebase for push; reminders without server push). "Event updates" extra approved by owner 2026-11-02.

## Evidence

Depends on #272's API (`POST/DELETE /api/devices`). Firebase project + config are an owner step; the build must succeed without them.

## Done

Code: `apps/android/app/src/main/kotlin/com/familyplanz/app/push/` (+ `data/DeviceSource.kt`, `FamilyPlanzApp.kt`). Owner guide: `docs/guides/android-push.md`.

- **Firebase without the google-services plugin**: `firebase-messaging` via `firebase-bom` 34.19.0 (messaging 25.1.3). `app/build.gradle.kts` reads gitignored `apps/android/firebase.properties` (`projectId`, `applicationId`, `apiKey`, `gcmSenderId`) into `BuildConfig.FIREBASE_*`; `FamilyPlanzApp.onCreate` → `FirebasePush.init` builds `FirebaseOptions` manually. Any value blank → `FirebaseConfig.of` = null → push off (no Firebase app, no channels), app unchanged. Gate runs with the file absent.
  - Why not BoM 35 / messaging 26: 26.0 deprecates `getToken`/`deleteToken`/`onNewToken` for a new `register()`/`onRegistered` API; stayed on the documented 25.x flow. Revisit when upgrading.
- **Device API** (`DeviceSource` / `NetworkDeviceSource`): `POST /api/devices {"token","platform":"android"}`, `DELETE /api/devices {"token"}` (Retrofit `@HTTP(hasBody=true)`); errors map through the shared `apiCall` (400 text, 401 Unauthorized, network).
- **Registration** (`DeviceRegistrar`): bearer absent → skip; network/5xx → unique WorkManager retry (`DeviceRegisterWorker`, network-constrained, exponential 30s, newest token REPLACEs); 400/401 final. Called from `FpMessagingService.onNewToken`, after token entry (`AppViewModel.saveToken` → `SessionHooks.signedIn`), and at app start (idempotent upsert).
- **Sign-out** (`AppViewModel.clearToken` → `PushSession.signedOut(previousBearer)`, NonCancellable): re-plan reminders, `DELETE /api/devices` with the old bearer, then `FirebaseMessaging.deleteToken()` so even a failed DELETE ends in a server prune. **Closes #271's gap**: `Reminders.rescheduleFromCache` now treats signed-out as "no cached events", so sign-out (and any later app start) cancels every alarm.
- **Messages** (`PushHandler`, from `FpMessagingService.onMessageReceived`): signed out → ignore everything. `events_changed` → `WorkManagerEventsRefresh` (unique `fp-events-changed`, REPLACE, expedited with `RUN_AS_NON_EXPEDITED_WORK_REQUEST`, network-constrained) → `EventsChangedWorker`: `refreshAndReplan` (shared with the 6h `RefreshWorker`: tasks + `ReminderPlanner.monthsToCover` months → `Reminders.rescheduleFromCache`). Pre-API-31 expedited shim: silent `ForegroundInfo` on a min-importance "Background sync" channel. `notification` → `ActivityNotifier` on channel **"Family activity"** (`family_activity`, high); blank title → "Family Planz"; empty → ignored; unknown type → ignored.
- Background-delivered `notification` messages (system-displayed): manifest `default_notification_channel_id` = `family_activity` + default icon; FCM copies `data.link` into the launch intent's `link` extra, same key as ours.
- **Tap**: `MainActivity` → `PushLinks.tabFor(link)` (`/calendar/tasks`, `/tasks` → Tasks; `/calendar…` → Calendar; else default).
- **Event updates (owner extra)**: `EventsChangedWorker` snapshots the cached horizon months before the refresh; after a REFRESHED run, `EventUpdatePlanner.notice(old, new, now, zone, locale)` diffs only months that had a snapshot (none → first fill → no notice). An event counts when its old or new version overlaps now…now+24h; dedupe by occurrence id (split rows), mirrors dropped. Lines: `Dentist moved to 3:00 PM · Tue` (start changed; `· today` when today), `New: Soccer practice · 5:00 PM today`, `Cancelled: Piano lesson` (row gone), `Updated: Dinner · location changed` (title / location / end time, joined "and"). All-day → `all day`. Several → one summary ("3 event updates", first line + "and N more", InboxStyle lines, earliest first). `EventUpdateNotifier`: channel **"Event updates"** (`event_updates`, default importance, user-mutable; channel off → not posted), POST_NOTIFICATIONS via #271's `ReminderNotifier.canPost` (now public, shared), tap → `fp_open_day` of the earliest change (same path as reminders).
- R8: no new rules needed — wire DTOs live in `data.**` (existing keep), Firebase ships consumer rules, service/app are manifest entries. `assembleRelease` green.
- Tests (all in `testDebugUnitTest`): `DeviceApiContractTest` (5, MockWebServer: body shape/method/bearer, 400 text, 401, network), `PushSessionTest` (9, fakes: register/skip/retry/final, sign-in, sign-out order, push off), `PushHandlerTest` (6: mapping, signed-out, link → tab), `FirebaseConfigTest` (2), `PushWorkTest` (2, work-testing: unique + network-bound), `ActivityNotifierTest` (3, Robolectric: channel/title/body/tap link, permission), `SessionHooksTest` (2, Robolectric AppViewModel), `RemindersSignOutTest` (1), `EventUpdatePlannerTest` (7, table-driven wording/window/dedupe/collapse), `EventUpdateNotifierTest` (3: summary lines, channel, tap day, permission, channel off).
- Evidence: `./gradlew :app:mobileGate :app:assembleRelease` → BUILD SUCCESSFUL, 173 unit tests, 0 failures (detekt clean, no suppressions), `firebase.properties` absent.

## Open / follow-ups

- Not verified on a device/emulator with a real Firebase project (owner step; see the guide).
- The actor's own phone also gets "Event updates" for edits made on the web (server fans `events_changed` to the actor too); fine per spec, revisit if noisy.
- Reminder permission banner still says "Get event reminders"; it now also gates push notifications.

## Needs doing

(none)
