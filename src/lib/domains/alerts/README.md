# alerts

**domain** — The Alert feed (closed type set, needs-you vs news), notification preferences, web push subscriptions, Android device tokens and push fan-out.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns: the Alert feed — one row per Alert, the newest 50, the closed five-type vocabulary and the needs-you / news split — plus mark-read, mark-all-read and pruning; the four notification preference switches stored in `activeSubscriptions.notificationMethods`; Web Push (VAPID) subscriptions; Android FCM device tokens; and push fan-out (a visible Alert push and the silent `events_changed` nudge).
- Does not own: the Alerts page chrome, the bell's nav placement, or the account card markup (screens compose this module's `ui/` and `index.ts`); who can see a calendar — `calendar` resolves the `events_changed` audience and passes the user ids in; the `activeSubscriptions` row itself — `billing` owns it and this module reads/updates only its `notificationMethods` JSON through the declared foreign read; the FCM wire transport — `kernel` owns it (today's legacy `fcmService`).
- Alerts are created by other modules (`tasks` on assignment/completion, `family` on join) through `createAlert`; every Alert write is in-app and fires a push.

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: wire contracts, the Alert vocabulary and feed rules, preference rules, the browser api and push client. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: the Alert/preference/device/push use-cases and this module's `endpoint()` handlers. | — |
| [ui/index.ts](ui/index.ts) | entry | Public components: the bell, the feed, its rows and toolbar, the push toggle. | — |
| [alerts.http.db.test.ts](alerts.http.db.test.ts) | test | Golden contract tests for every `/api` route the module owns. The two preference routes are spec goldens: their legacy handlers import `$env/static/private`, so they are loaded dynamically and skip until S6 removes that import. | — |
| [alerts.fixtures.server.ts](alerts.fixtures.server.ts) | fixtures | Row builders for this module's db tests: an Alert, a device token, a preference row (tierless and unexpired). They insert directly because a real Alert write fires push. | — |

## Public interface

Designed in S1; every name below lands in one of the three entry files. Everything internal (repo queries, transports, message builders used only by a service) stays unexported — if deleting an export would only move its body into one caller, it is not an export.

- `index.ts`
  - contract: `AlertRow`, `AlertType`, `AlertFilter`, `AlertPreferenceId`, `AlertPreferences`, `AlertPreferenceOption`; bodies/responses `AlertListResponse`, `AlertsMarkBody`, `DeviceRegistrationBody`, `PushSubscriptionBody`, `AlertPreferencesResponse`, `AlertPreferenceBody`. One schema per wire body, inferred types sharing the name.
  - vocabulary rules: `ALERT_TYPES`, `isAlertType`, `alertGroup`, `alertLabel`, `alertTone`, `alertGlyph`, `toAlertRow`, `unrecognisedAlertTypes` — one home for the closed set, so the bell and the page can never name a type differently.
  - feed rules: `ALERT_PAGE_SIZE`, `filterAlerts`, `groupAlerts`, `alertCounts` — pure, so chip counts and grouping are pinned without a DOM.
  - preference rules: `ALERT_PREFERENCES`, `DEFAULT_ALERT_PREFERENCES`, `isAlertPreferenceId`, `preferencesFrom`, `withPreference`, `preferenceChangeLabel`, `saveOutcome` — one list drives the card, the GET options and the PUT receipt.
  - client: `alertsApi` (one client object: list, mark, markAll, prune, registerDevice, unregisterDevice, publicKey, subscribePush, unsubscribePush, getPreferences, setPreference) and `subscribeToPush`, `unsubscribeFromPush`, `getPushState` for the browser push flow.
- `index.server.ts`
  - feed use-cases: `createAlert`, `listAlertFeed`, `markAlertRead`, `markAllAlertsRead`, `pruneReadAlerts`, `pruneReadAlertsOlderThan` (the app cron's call).
  - preferences: `getAlertPreferences`, `setAlertPreference`.
  - devices and push: `registerDevice`, `unregisterDevice`, `getPushPublicKey`, `savePushSubscription`, `removePushSubscription`, `nudgeEventsChanged`.
  - endpoints: `listAlertsEndpoint`, `markAlertsEndpoint`, `registerDeviceEndpoint`, `unregisterDeviceEndpoint`, `pushPublicKeyEndpoint`, `subscribePushEndpoint`, `unsubscribePushEndpoint`, `listAlertPreferencesEndpoint`, `setAlertPreferenceEndpoint`.
- `ui/index.ts`
  - `AlertsBell` — the nav bell: unread badge, 60 s poll of `GET /api/notifications`, row tap marks read then navigates, push section.
  - `AlertsFeed`, `AlertsToolbar`, `AlertsRow` — the Alerts page: header count, three filter chips, two sections, empty states, mark-all and delete-read.
  - `PushToggle` — enable/disable browser push through the click-time permission flow.

## How to test

- Whole module: `npm run test:mod -- alerts` (add `--legacy` while legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup. The closed type set, group split, labels, chip counts and stored-preference parsing are all pinned here.
- Database + services: `*.db.test.ts` with `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: `alerts.http.db.test.ts` runs in committed mode (`beforeEach(truncateAll)`) and pins status + full body of every endpoint. The two `/api/me/notification-preferences` describes are marked `golden from spec`: their legacy route imports `accountData → sendEmail → $env/static/private`, so the file imports them dynamically and skips today; they run unedited from S6 on.
- Push never runs in tests: no `/api` route sends push, and the service tests drive the channel seam with fakes. FCM and web-push are never contacted.
- UI: `ui/*.svelte.test.ts` render with props; the state classes are tested without a DOM.
- Fixtures: `alerts.fixtures.server.ts` — `seedAlert`, `seedDeviceToken`, `seedAlertPreferencesRow` (direct inserts, never through the services, so no push is sent).

## Invariants

Behaviour that must not change. Wire rules name the golden in `alerts.http.db.test.ts`; the rest name the test that pins them, with the step that adds it.

- The Alert vocabulary is exactly five types; the guard rejects non-strings, case variants and anything else — `src/lib/utils/notificationTypes.ts:14` — `alerts.vocabulary.rules.test.ts › is exactly the five-member union` (S3).
- Group is a property of the type: only `assignment_pending` and `assignment_declined` are **needs you**; every other type, including an unrecognised one, is **news** — `src/lib/utils/notificationTypes.ts:40` — `alerts.vocabulary.rules.test.ts › never lets an unrecognised type claim to need a decision` (S3), and the golden `GET /api/notifications › answers the caller feed newest first, guarded, with the unread count`.
- Labels are Asked you / Accepted / Declined / Completed / Added to family; an unknown type renders `Update` and never echoes the column — `src/lib/utils/notificationTypes.ts:54` — `alerts.vocabulary.rules.test.ts › labels an unrecognised type as Update rather than echoing the raw string` (S3).
- An unrecognised Alert is kept, never dropped: `type: null`, `rawType` preserved, group derived from the raw value, `link`/`readAt` normalised to null — `src/lib/utils/notificationTypes.ts:127` — same golden as above (the `mystery_type` row) plus `alerts.vocabulary.rules.test.ts` (S3).
- One feed, one page size: 50 rows, newest `createdAt` first, shared by the bell API and the Alerts page — `src/lib/server/db/actions/notifications.ts:39` — `GET /api/notifications › reads at most the 50 newest rows while counting every unread`, and the page test (S7) reads the same `ALERT_PAGE_SIZE`.
- `GET /api/notifications` answers `{notifications, unreadCount}` with guarded rows and the caller's whole unread count — `src/routes/api/notifications/+server.ts:14` — `GET /api/notifications › answers the caller feed newest first, guarded, with the unread count`.
- Mark-read and mark-all are scoped to the caller's `userId`; mark-all touches only `readAt IS NULL` rows — `src/lib/server/db/actions/notifications.ts:61` — `POST /api/notifications › marks one row read, scoped to the caller`, `› marks every unread row read, scoped to the caller`, `› does not mark another persons row read`, `› is visible in the next GET: the row is read and the unread count drops`.
- Pruning deletes only read rows and returns the count; unread Alerts are never pruned — `src/lib/server/db/actions/notifications.ts:81` — `POST /api/notifications › prunes only the caller read rows and returns the count`.
- The feed's write actions are ordered `all` → `pruneRead` → `id`; an unknown id is a silent no-op with `200 {success:true}` — `src/routes/api/notifications/+server.ts:40` — `POST /api/notifications › lets {all:true} win over {pruneRead:true}`, `› answers {success:true} for an unknown id and changes nothing`.
- `POST /api/notifications` answers `Invalid request body` only for a string, `null`, malformed JSON or empty body (the `isNotificationBody` guard is `typeof value === 'object' && value !== null`, so an array passes it and reaches the id check); an object with no usable action answers `Notification id is required` — `src/routes/api/notifications/+server.ts:29-33,46,66` — the `Invalid request body` and `Notification id is required` goldens in `POST /api/notifications` (the id-required table includes an empty array).
- Creating an Alert inserts, then fires a push with title = actor name, body = message and tap target `link` (default `/calendar/tasks`) without awaiting it; a failed write is logged, never thrown — `src/lib/server/db/actions/notifications.ts:6` — `alerts.service.db.test.ts › logs a failed Alert write instead of failing the caller` (S5). Push is not contactable in tests; the row and the channel seam are asserted.
- The weekly cron prunes read Alerts older than 90 days; unread Alerts stay forever. The cutoff is the `app` cron's 90-day constant, the delete is this module's `pruneReadAlertsOlderThan` — `src/lib/server/db/actions/notifications.ts:94`; `src/routes/api/cron/cleanup/+server.ts:15,41` — `alerts.service.db.test.ts › prunes only read Alerts before the cutoff` (S5).
- Preference switches are four, in this order: Task assigned to me (In-app and push, on), Task completed (In-app and push, on), Someone joined the family (In-app only, off), AI event suggestions (Uses your AI allowance, on) — `src/lib/components/account/accountNotifications.ts:37` — `GET /api/me/notification-preferences › answers the four defaults for an account with no subscription row, and writes nothing` (spec golden) and `alerts.preferences.rules.test.ts › keeps the approved order and the one off-by-default` (S3).
- Stored preferences live in `activeSubscriptions.notificationMethods.preferences`; only real booleans count, missing/partial/malformed bags read as the defaults, and a read never writes — `src/lib/components/account/accountNotifications.ts:120`; `src/lib/server/db/actions/notificationMethods.ts:50` — the spec golden `GET /api/me/notification-preferences` (defaults, stored, `writes nothing`) and `alerts.preferences.rules.test.ts` (S3).
- A save copies the legacy billing half `{email, sms}` through untouched and rewrites only `preferences` — `src/lib/components/account/accountNotifications.ts:144` — `PUT /api/me/notification-preferences/[id] › keeps the legacy {email,sms} half of the row untouched` (spec golden).
- With no subscription row, the first toggle inserts a tierless row (`subscriptionTypeId: null`, `endDate` 9999-12-31, `email:false, sms:false`) so it stays out of every plan read and claims no channel consent — `src/lib/server/db/actions/notificationMethods.ts:68` — `PUT /api/me/notification-preferences/[id] › creates a tierless row on the first toggle` (spec golden).
- The preferences row is the user's newest unexpired row (`endDate > now` or null); a tier is not required — `src/lib/server/db/actions/notificationMethods.ts:26` — `GET /api/me/notification-preferences › reads the stored switches of the newest unexpired row`, `› ignores an expired row and falls back to the defaults` (spec goldens).
- The PUT receipt is `<Label> alerts are on|off. Saved.`; a failed save is `500 <Label> alerts are on|off. This did not save.` — `src/lib/server/services/accountData.ts:246` — `PUT /api/me/notification-preferences/[id] › saves one switch and answers the receipt` (spec golden). The 500 path needs an injected write failure and is pinned by `alerts.service.db.test.ts` (S5).
- An unknown preference id is `400 Unknown notification preference`; a non-boolean value is `400 Notification preference value is required`; a non-object body is `400 Invalid JSON` — `src/routes/api/me/notification-preferences/[id]/+server.ts:17,22`; `src/lib/server/utils/jsonBody.ts:13` — the three `400` goldens in that describe (spec goldens).
- A failed save on the account card puts the switch back where the server still has it and says `<Label> didn’t save — try again.` — `src/lib/components/account/accountNotifications.ts:191` — `alerts.state.test.ts › reverts the switch a failed save left flipped` (S7).
- `/api/devices` is one parser for both methods: `token` is trimmed, must be non-empty and at most 4096 characters; `platform` is absent → `android`, must be `android`, and DELETE validates it even though it does not use it — `src/routes/api/devices/+server.ts:33` — the `POST /api/devices` and `DELETE /api/devices` goldens, including `› validates the platform even though DELETE ignores it`.
- Device registration is an upsert by token: it re-owns the token to the caller and refreshes `lastSeenAt`; removal deletes only the caller's row and is idempotent — `src/lib/server/services/devicePushService.ts:23,39` — `POST /api/devices › re-owns a token registered by another account`, `DELETE /api/devices › removes only the caller row and answers {success:true}`, `› answers {success:true} when the caller has no such row`.
- FCM fan-out: a visible Alert push is `data {type:'notification', link?}` plus a notification block and `android.priority: high`; the silent `events_changed` is data-only `{type, actorId}` with `collapse_key: 'events_changed'` and `ttl: '600s'` — `src/lib/server/services/fcmService.ts:95,115` — `alerts.push.rules.test.ts` (S3) and `alerts.service.db.test.ts › sends one events_changed message per token, users deduped` (S5).
- The `events_changed` audience includes the actor, and the message carries `actorId` so the actor's own phone refreshes silently instead of announcing an update (#281) — `src/lib/server/services/eventsChangedNudge.ts:58`; `src/lib/server/services/devicePushService.ts:110` — `alerts.service.db.test.ts › sends the nudge to every passed user, actor included` (S5).
- Web Push fan-out runs the web and device channels in parallel; one failing channel never blocks the other and the call never rejects — `src/lib/server/services/pushService.ts:83` — `alerts.service.db.test.ts › one channel failing never blocks the other` (S5).
- Web Push skips silently when VAPID is unset, and a 404/410 from the push service deletes that caller's subscription row; other failures are logged — `src/lib/server/services/pushService.ts:38,98,128` — `alerts.service.db.test.ts › prunes a subscription the push service reports gone`, `› does no work when VAPID is unset` (S5).
- `POST /api/push/subscribe` upserts by endpoint (re-owning it) and `POST /api/push/unsubscribe` deletes only the caller's row for that endpoint; both are idempotent — `src/lib/server/services/pushService.ts:42,65` — `POST /api/push/subscribe › upserts by endpoint, re-owning it to the caller`, `POST /api/push/unsubscribe › removes only the caller subscription for that endpoint` goldens.
- `/api/push/public-key` is public and answers `{publicKey}` — `null` when `VAPID_PUBLIC_KEY` is unset, the raw value otherwise — `src/lib/server/services/pushService.ts:29` — `GET /api/push/public-key` goldens.
- The push client asks permission inside the click before any I/O, needs a secure context and an existing service worker, reuses an existing subscription instead of calling `subscribe()`, and unsubscribes locally when the server rejects it — `src/lib/utils/pushClient.ts:83,118,143,167` — `alerts.pushClient.test.ts › reuses an existing subscription instead of calling subscribe()`, `› returns no-service-worker when no registration exists` (S7).
- The bell triggers at 44×44 px, caps the badge at `99+`, polls `GET /api/notifications` every 60 s, marks a row read optimistically then navigates to `link`, and restores unread + toasts when that POST fails — `src/lib/components/NotificationBell.svelte:70,157,176,192` — `ui/AlertsBell.svelte.test.ts › is 44px square`, `› says so when marking read fails instead of swallowing it` (S7).
- The Alerts page header says `N unread` or "You're all caught up"; chips are All / Needs you / Unread counted over the whole loaded feed; an empty section is omitted and "Nothing matches this filter." appears when the filter empties the feed — `src/routes/(calendar)/calendar/notifications/+page.svelte:186,247,262,270`; `src/lib/utils/notificationTypes.ts:180` — `alerts.state.test.ts › keeps its counts while a filter is active` (S7).
- A row is a real `<a href>`: a plain click marks read then navigates, a modified click is left to the browser, and an already-read row navigates without a POST — `src/routes/(calendar)/calendar/notifications/+page.svelte:106-135` — `ui/AlertsRow.svelte.test.ts` (S7).
- Mark all read updates optimistically, toasts "Everything marked as read.", and reverts on failure; "Delete read alerts" asks inline and toasts `Deleted N read alert(s).` — `src/routes/(calendar)/calendar/notifications/+page.svelte:67,96` — `alerts.state.test.ts` (S7).
- The Alerts page load logs unrecognised types server-side and redirects an anonymous visitor 302 to `/login` — `src/routes/(calendar)/calendar/notifications/+page.server.ts:9-24` — `alerts.http.server` page-load test / `alerts.state.test.ts` (S7).

## Depends on

- May import: kernel, identity, billing (their public entries only).
- Owns tables: `notifications`, `pushSubscriptions`, `deviceTokens`.
- Reads (join only): `subscriptions` — the `notificationMethods` JSON the preference switches live in; declared in `FOREIGN_READS` and written through this module's repo because billing has no preference API yet.
- Calls: `identity` for the `Actor` shape only; no direct service call today.
- Called by: `tasks` and `family` create Alerts through `createAlert`; `calendar` resolves who can see a touched calendar and calls `nudgeEventsChanged` with those user ids (plus the actor); `app`'s weekly cron calls `pruneReadAlertsOlderThan`; `shell` renders `AlertsBell`; the account screen renders the preference switches from `index.ts`; the Alerts route wires `listAlertsEndpoint`-style handlers (S6) and `AlertsFeed`.
