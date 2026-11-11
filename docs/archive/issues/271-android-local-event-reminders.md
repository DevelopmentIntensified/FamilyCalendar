# 271 — Android: event reminders scheduled on the phone (no server push)

Status: done

Source: owner call 2026-11-02 (Firebase for push; reminders without server push).

## Evidence

Events carry `reminderMinutes` (EventDto.kt:25, from GET /api/events). The phone caches events (FileTaskCache) and refreshes every 6h (#268), but never alerts. Owner call 2026-11-02: event reminders must work with no server push.

## Done

Code: `apps/android/app/src/main/kotlin/com/familyplanz/app/reminders/`.

- **Entry point (for #273 FCM `events_changed`)**: `com.familyplanz.app.reminders.Reminders.rescheduleFromCache(context, force = false)` (suspend, serialized by a Mutex, never throws). Reads only the on-disk cache, so #273 should refresh the horizon months first (e.g. `CacheRefresher.refresh()` or `repo.monthEvents` for `ReminderPlanner.monthsToCover(today)`), then call it. `force = true` re-sets every alarm.
- Callers today: `MainActivity.onCreate` (app start); every successful events fetch in the app (`ReminderAwareCache` wraps `FileTaskCache`, re-plans after `saveEvents`); `RefreshWorker` after `REFRESHED`; `RescheduleReceiver` (BOOT_COMPLETED, TIME_SET, TIMEZONE_CHANGED, MY_PACKAGE_REPLACED, SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED) with `force = true`.
- `ReminderPlanner` (pure): events + now + zone + persisted set -> `toSchedule` / `toCancel` / `next`. Rules:
  - `reminderMinutes` null or negative -> none; 0 -> at start.
  - Timed: fire = start - reminder. **All-day: fire = device-zone start-of-day - reminder** (0 -> local midnight; 1440 -> midnight the day before). Zone change re-plans (receiver), so all-day alarms follow the phone.
  - Window: fire >= now - 1 min grace and <= now + 14 days; late fire times are dropped (no burst of stale alerts after offline spells).
  - Dedupe by occurrence id (recurring composite ids `{master}~{occ}` each get their own alarm; multi-day split rows collapse). Mirror rows whose `mirrorOf` is in the same set are dropped; `rsvpStatus == "declined"` never reminds.
  - Changed start/title -> re-set (same PendingIntent identity replaces); removed / reminder off -> cancel.
- `ReminderPlanner.monthsToCover(today)` = month of today and of today+14d. `CacheRefresher` (#268) now refreshes every such month (next month too across a boundary); `ReminderSync` reads the same months from cache.
- Scheduled set persisted to `filesDir/scheduled-reminders.json` (`FileScheduledReminderStore`), so cancels work after process death; corrupt file -> empty.
- `AndroidAlarmScheduler` (behind `AlarmScheduler`): PendingIntent identity = data URI `familyplanz://reminder/<id>`; `RTC_WAKEUP`.
- **Exact-alarm choice**: `USE_EXACT_ALARM` (API 33+, install-time, no user toggle) + `SCHEDULE_EXACT_ALARM` `maxSdkVersion=32` for API 31-32. Guard: `canScheduleExactAlarms()` false (or SecurityException) -> inexact `setAndAllowWhileIdle` (may be minutes late in Doze, never lost). **Play policy note**: `USE_EXACT_ALARM` is restricted to apps whose core function is alarm clock or calendar; Family Planz qualifies as a calendar app, but the Play Console declaration form must say so at submission. If Play rejects it, drop `USE_EXACT_ALARM`, raise `SCHEDULE_EXACT_ALARM` maxSdk, and the existing fallback keeps reminders working (inexact).
- `ReminderReceiver` posts on channel id `event_reminders`, name **"Event reminders"** (IMPORTANCE_HIGH); title = event title, text = `4:00 PM · Tue, Nov 3` / `All day · Thu, Nov 5` (device zone/locale). Tap -> `MainActivity` with `fp_open_day=YYYY-MM-DD` -> Calendar tab + `CalendarViewModel.openDay()` (loads that month, opens the Day view). Not posted when notifications are blocked (no crash).
- POST_NOTIFICATIONS: `ReminderPermissionSlot` banner above the tabs (in `FamilyPlanzHost` `banner` slot). API 33+ not granted -> "Get event reminders" + **Allow notifications** (system prompt); refused / disabled in Settings -> "Event reminders are off" + **Open settings**; "Not now" hides for the session; re-checked on resume.
- `CalendarViewModel.load` now drops a superseded month fetch (openDay vs. init load race).
- R8: keep rule for `@Serializable` in `reminders.**` (persisted set); receivers kept via manifest.
- Tests: `ReminderPlannerTest` (26), `ReminderSyncTest` (6, fakes + temp dir: cross-month, process-death cancel, force), `ReminderReceiverTest` (6, Robolectric: notification title/time/channel/tap extra, no-permission, AlarmManager set/replace/cancel), `ReminderPermissionUiTest` (3), `ReminderTapUiTest` (3: openDay, garbage, cache hook), `CacheRefresherTest` +1 (next month across boundary).
- Evidence: `./gradlew :app:mobileGate :app:assembleRelease` -> BUILD SUCCESSFUL, 125 unit tests, 0 failures (detekt clean).

## Open / follow-ups

- Sign-out does not cancel already-scheduled alarms (they fire from cached data until the next re-plan finds an empty cache). Wire `Reminders` into sign-out if that matters.
- Not verified on a physical device / emulator (Doze timing, OEM battery killers).

## Needs doing

(none)
