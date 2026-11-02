# 281 — Don't notify "Event updates" for the user's own edit

Status: open

Source: #273 hand-back 2026-11-02 — the editor's phone also gets an "Event updates" notification, because #272's `events_changed` nudge goes to the actor too (needed so the editor's other devices refresh).

## Needs doing

- Server: `nudgeEventsChanged(actorId, …)` adds `data.actorId` to the `events_changed` FCM data message (string; keep collapse key). Document in task-api-spec "Android push devices".
- Android: persist the signed-in user's id (from `GET /api/me`) where the push worker can read it; `EventsChangedWorker` still refreshes + reschedules reminders, but skips posting "Event updates" when `actorId == me`. Missing actorId (older server) → current behaviour.
- Tests: server message body includes actorId; Android planner/worker test for self-edit suppression.
