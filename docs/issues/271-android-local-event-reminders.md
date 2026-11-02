# 271 — Android: event reminders scheduled on the phone (no server push)

Status: open

Source: owner call 2026-11-02 (Firebase for push; reminders without server push).

## Evidence

Events carry `reminderMinutes` (EventDto.kt:25, from GET /api/events). The phone caches events (FileTaskCache) and refreshes every 6h (#268), but never alerts. Owner call 2026-11-02: event reminders must work with no server push.

## Done

(none yet)

## Needs doing

- Schedule a local notification at `start - reminderMinutes` for each upcoming cached event occurrence (recurring occurrences arrive expanded with composite ids); cancel ones that disappeared/changed; dedupe by occurrence id.
- Expose one entry point (e.g. `ReminderScheduler.rescheduleFromCache()`) that #273's FCM `events_changed` handler and the refresh worker both call.
- Exact timing: `USE_EXACT_ALARM` (calendar apps qualify under Play policy) or `SCHEDULE_EXACT_ALARM` + `canScheduleExactAlarms()` fallback to inexact `setAndAllowWhileIdle`; document the choice.
- Reschedule on: app start, after every successful events fetch (incl. the #268 worker), BOOT_COMPLETED, time/zone change. Make sure the next ~14 days are covered across a month boundary (fetch next month too when needed).
- Notification channel 'Event reminders'; POST_NOTIFICATIONS runtime request (API 33+) with a clear rationale; tap opens the app on that day.
- Pure scheduling planner (events + now + already-scheduled -> to-schedule / to-cancel) unit-tested first; Robolectric test for the receiver posting a notification.
- Gate: Android `:app:mobileGate` / web `npm run build` + targeted vitest green.
