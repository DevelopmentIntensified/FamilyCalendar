# 272 — Server: deliver notifications to Android via FCM (device tokens + HTTP v1)

Status: open

Source: owner call 2026-11-02 (Firebase for push; reminders without server push).

## Evidence

`createNotification` (src/lib/server/db/actions/notifications.ts:21) fans out through `sendPushToUser` (src/lib/server/services/pushService.ts:70), which only does Web Push (VAPID). Owner call 2026-11-02: use Firebase for Android push.

## Done

(none yet)

## Needs doing

- Table `device_tokens` (id, user_id FK cascade, token unique, platform 'android', created_at, last_seen_at): Drizzle schema + `sql/migrations/023-device-tokens.sql` (idempotent) + bundled in `src/lib/server/db/migrations/scripts.ts` (parity gate). Owner runs it (no DB creds in session).
- API (Bearer fp_ token or session, same auth as /api/tasks): `POST /api/devices {token, platform:'android'}` -> 200 `{success:true}` (upsert, refresh last_seen_at, re-own token to caller); `DELETE /api/devices {token}` -> 200 (only caller's row). 400 on missing/oversized token. Document in docs/guides/task-api-spec.md (or a devices section).
- FCM HTTP v1 sender with no new heavy deps: env `FCM_SERVICE_ACCOUNT_JSON` (raw JSON or base64); sign the RS256 JWT with node:crypto, exchange at oauth2.googleapis.com/token, cache the access token until expiry; POST `https://fcm.googleapis.com/v1/projects/{project_id}/messages:send` with notification{title,body} + data{link}. Not configured -> skip silently (like VAPID).
- `sendPushToUser` sends to web subscriptions AND device tokens in parallel; one channel failing never blocks the other; delete tokens on FCM 404/UNREGISTERED or 400 INVALID_ARGUMENT for the token.
- Tests: fetch stubbed (token exchange, send, unregistered prune, not-configured skip, JWT claims), API route tests. List new env vars in .env.example.
- Gate: Android `:app:mobileGate` / web `npm run build` + targeted vitest green.
