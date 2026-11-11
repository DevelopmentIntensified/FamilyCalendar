# 281 — Don't notify "Event updates" for the user's own edit

Status: done

Source: #273 hand-back 2026-11-02 — the editor's phone also gets an "Event updates" notification, because #272's `events_changed` nudge goes to the actor too (needed so the editor's other devices refresh).

## Done

- 2026-11-02, `fix(281): …`.
- Server: `EventsChangedData {type:'events_changed', actorId}` (`devicePushService.ts`); `eventsChangedMessage(actorId)` puts it in FCM `data` (collapse key/TTL unchanged); `nudgeEventsChanged` passes the actor. Spec "Android push devices" table + note updated. Tests: `fcmService.test.ts`, `devicePushService.test.ts`, `eventsChangedNudge.test.ts` assert `actorId` in the body.
- Android: `DataStoreTokenStore.userId()/saveUserId()` (same `fp_session` DataStore; cleared on sign-out and on saving a new token); `AppViewModel.refresh()` stores `GET /api/me` id. FCM `data.actorId` → `PushPayload.actorId` → `EventsRefreshScheduler.enqueue(actorId)` → worker input `actor_id`. `EventsChangedRun` (pure, faked cache/refresh/notifier) still refreshes + re-plans, skips the notice when `actorId == me`; blank/missing actorId or unknown me → announces as before. Tests: `EventsChangedRunTest` (4), `PushHandlerTest` (+1), `SessionHooksTest` (+2).
- Known edge: a burst (someone else's edit, then yours) collapses (FCM collapse key + WorkManager REPLACE) into your silent nudge, so the other edit isn't announced; it is still refreshed.

## Original ask

- Server: `nudgeEventsChanged(actorId, …)` adds `data.actorId` to the `events_changed` FCM data message (string; keep collapse key). Document in task-api-spec "Android push devices".
- Android: persist the signed-in user's id (from `GET /api/me`) where the push worker can read it; `EventsChangedWorker` still refreshes + reschedules reminders, but skips posting "Event updates" when `actorId == me`. Missing actorId (older server) → current behaviour.
- Tests: server message body includes actorId; Android planner/worker test for self-edit suppression.
