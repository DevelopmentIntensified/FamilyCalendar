# 272 — Server: deliver notifications to Android via FCM (device tokens + HTTP v1)

Status: done

Source: owner call 2026-11-02 (Firebase for push; reminders without server push).

## Evidence

`createNotification` (src/lib/server/db/actions/notifications.ts:21) fans out through `sendPushToUser` (src/lib/server/services/pushService.ts:70), which only does Web Push (VAPID). Owner call 2026-11-02: use Firebase for Android push.

## Done

- `device_tokens` table: drizzle `deviceTokens` (schema.ts) + `sql/migrations/023-device-tokens.sql` (idempotent: `CREATE TABLE/INDEX IF NOT EXISTS`) + bundled in `src/lib/server/db/migrations/scripts.ts` (parity gate green).
- `src/lib/server/services/fcmService.ts` — FCM HTTP v1 transport, no deps: `parseServiceAccount` (raw JSON or base64; literal `\n` in keys unescaped), `signServiceAccountJwt` (node:crypto RS256, scope firebase.messaging, aud token_uri, 1h), OAuth exchange cached until expiry-60s with one shared in-flight exchange, cache dropped on 401; `messages:send`; result `sent|unregistered|failed` (unregistered = 404, `UNREGISTERED`, or 400 INVALID_ARGUMENT naming `message.token`; a payload INVALID_ARGUMENT is not a prune). `getFcmSender()` memoized per env value; null when `FCM_SERVICE_ACCOUNT_JSON` unset/invalid (silent skip).
- `src/lib/server/services/devicePushService.ts` — register (upsert, re-own, refresh `last_seen_at`) / remove (caller's row only); `sendNotificationToDevices`; `sendDataToUsers(userIds, {type:'events_changed'})` (data-only, `android.priority high`, `collapse_key events_changed`, `ttl 600s`); dedupes users + tokens; prunes dead tokens; never throws.
- `sendPushToUser` (pushService.ts) = `Promise.allSettled([webPush, fcm])` — independent channels; VAPID gate moved into the web leg (`sendWebPushToUser`).
- `POST/DELETE /api/devices` (`src/routes/api/devices/+server.ts`), Bearer fp_ or session, deps seam; 400 missing/blank/non-string/>4096 token or non-android platform.
- Sync nudge `src/lib/server/services/eventsChangedNudge.ts` `nudgeEventsChanged(actorId, calendarIds)`: synchronous no-op when FCM unconfigured; otherwise the audience (actor ∪ owners of touched calendars ∪ family members of their families ∪ actor's accessible calendars — superset covers family mirrors) is resolved off the request path and ONE `sendDataToUsers` call goes out; never rejects; callers `void` it (not awaited). Wired once per request after a successful write in: `POST /api/events`, `PUT /api/events/[id]` (series + `scope:'this'`, old+new calendar on move), `DELETE /api/events/[id]` (all / this / occurrence cancel), `POST /api/events/bulk` (every op incl. smart; one nudge per request, only when applied > 0; not on dryRun/4xx), `calendar/event/[id]?/deleteEvent`, `calendar/import?/commit` + `?/undo` (via ImportDeps seam). Not on reads or RSVP.
- `.env.example`: `FCM_SERVICE_ACCOUNT_JSON`. Docs: `docs/guides/task-api-spec.md` "Android push devices" (contract, payload shapes, owner setup).

Evidence (2026-11-02, worktree, mocked db, fetch stubbed):
- `fcmService.test.ts` 27, `devicePushService.test.ts` 7, `pushService.test.ts` 2, `eventsChangedNudge.test.ts` 4, `api/devices/server.test.ts` 17, `api/events/nudge.test.ts` 10 (7 red with the route wiring reverted, green with it), import `page.server.test.ts` +4 — all green; existing `api/events/**` + import suites green.
- Full server project: only pre-existing env/infra failures (`*.real.test.ts` no Postgres, `auth.test.ts` placeholder-secret test vs exported BETTER_AUTH_SECRET, `links.test.ts` svelte symlink resolution).
- svelte-check: no errors in touched files. `npm run build` green.

Owner step (no DB creds in session) — run against preview, then prod:

```
npx dotenv -e .env.preview -- node scripts/db-exec.mjs sql/migrations/023-device-tokens.sql
npx dotenv -e .env.prod -- node scripts/db-exec.mjs sql/migrations/023-device-tokens.sql
```

Then Firebase console → Project settings → Service accounts → Generate new private key; Vercel env `FCM_SERVICE_ACCOUNT_JSON` = `base64 -w0 key.json` (Preview + Production), redeploy.

Notes / assumptions:
- Nudge on serverless is fire-and-forget without `waitUntil` (`@vercel/functions` not a dependency); Vercel Fluid compute normally lets the pending promise finish, but a frozen instance could drop a nudge. Acceptable: the phone also refreshes on open/periodic work (#273).
- The audience is a deliberate superset (all of the actor's accessible calendars), so a personal-event edit also nudges family devices — silent + collapsed, cheap.
- `scope:'all'` DELETE does not read the row first, so an event the actor owns on a calendar they can no longer see nudges only the actor's accessible audience.
- Out of scope / not nudged: ad injection (`adService`), guest-merge re-owning (`guestMergeService`), RSVP.

## Needs doing

- Table `device_tokens` (id, user_id FK cascade, token unique, platform 'android', created_at, last_seen_at): Drizzle schema + `sql/migrations/023-device-tokens.sql` (idempotent) + bundled in `src/lib/server/db/migrations/scripts.ts` (parity gate). Owner runs it (no DB creds in session).
- API (Bearer fp_ token or session, same auth as /api/tasks): `POST /api/devices {token, platform:'android'}` -> 200 `{success:true}` (upsert, refresh last_seen_at, re-own token to caller); `DELETE /api/devices {token}` -> 200 (only caller's row). 400 on missing/oversized token. Document in docs/guides/task-api-spec.md (or a devices section).
- FCM HTTP v1 sender with no new heavy deps: env `FCM_SERVICE_ACCOUNT_JSON` (raw JSON or base64); sign the RS256 JWT with node:crypto, exchange at oauth2.googleapis.com/token, cache the access token until expiry; POST `https://fcm.googleapis.com/v1/projects/{project_id}/messages:send` with notification{title,body} + data{link}. Not configured -> skip silently (like VAPID).
- `sendPushToUser` sends to web subscriptions AND device tokens in parallel; one channel failing never blocks the other; delete tokens on FCM 404/UNREGISTERED or 400 INVALID_ARGUMENT for the token.
- Silent sync nudge (owner 2026-11-02: reminders must follow server-side event edits): `sendDataToUsers(userIds, {type:'events_changed'})` — FCM data-only message (no notification block, `android.priority: 'high'`, collapse key `events_changed`, short TTL). Call it after event create / update / move / delete / bulk edit / RSVP-irrelevant changes for every user who can see the event's calendar (owner + calendar/family members), deduped once per request (a bulk edit sends one nudge per user, not per event). Never blocks or fails the mutation.
- Tests: fetch stubbed (token exchange, send, unregistered prune, not-configured skip, JWT claims), API route tests. List new env vars in .env.example.
- Gate: Android `:app:mobileGate` / web `npm run build` + targeted vitest green.
