# Port sheet: alerts

**domain** · rank 3 · port #4 · home: `src/lib/domains/alerts/` · README after the port: `src/lib/domains/alerts/README.md` (written in S1)

The Alert feed (closed type set, needs-you vs news), notification preferences, web push subscriptions, Android device tokens and push fan-out.

- **May import:** kernel, identity, billing.
- **Owns tables:** `notifications`, `pushSubscriptions`, `deviceTokens`.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `169ba91`
- [ ] S3 contract + rules
- [ ] S4 repo (+ fixtures)
- [ ] S5 service
- [ ] S6 http + route wiring (goldens unchanged since S2)
- [ ] S7 UI rebuild (rules, api, state, components, screen) + visual check
- [ ] S8 rewire importers, delete legacy code and legacy tests
- [ ] S9 README final, census --write, gate:push, ledger done

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- Closed Alert type set (5); an unknown stored type renders as group "news", label "Update".
- needs-you vs news grouping is a property of the type.
- Feed page size 50; mark read / mark all read; read notifications pruned after 90 days.
- `/api/devices`: `POST {token, platform?:"android"}`, `DELETE` with a JSON body → `200 {success:true}`, idempotent; platform must be android.
- Push: web-push 404/410 prunes the subscription; FCM data payloads; `events_changed` nudge never notifies the actor (#281).
- Notification preferences live in `activeSubscriptions.notificationMethods` (sibling JSON key); legacy `{email, sms}` rows must survive.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/devices` | POST | signed-in (Bearer `fp_` token or session) | `{token: string, platform?: 'android'}`; token trimmed, non-empty, ≤4096 chars; platform absent → `'android'`; non-object or unparseable JSON → 400 | `200 {success:true}` | `401 {error:'Unauthorized'}`; `400 {error:'token is required'}`; `400 {error:'token is too long'}`; `400 {error:"platform must be 'android'"}` | `src/routes/api/devices/+server.ts:32-53` |
| `/api/devices` | DELETE | signed-in | same parser (platform validated but unused); `{token}` | `200 {success:true}` (idempotent: absent row still succeeds) | `401 {error:'Unauthorized'}`; `400 {error:'token is required'}` / `{error:'token is too long'}` / `{error:"platform must be 'android'"}` | `src/routes/api/devices/+server.ts:55-64` |
| `/api/notifications` | GET | signed-in | none; always the shared 50-row window | `200 {notifications: NotificationRow[], unreadCount}` (rows guarded: `type: NotificationType\|null`, `rawType`, `group`) | `401 {error:'Unauthorized'}` | `src/routes/api/notifications/+server.ts:14-25` |
| `/api/notifications` | POST | signed-in | `{all:true}` \| `{pruneRead:true}` \| `{id: non-empty string}`; any other JSON object → 400 `Notification id is required`; non-object → 400 `Invalid request body` | `200 {success:true}`; prune also `{success:true, removed:n}` | `401 {error:'Unauthorized'}`; `400 {error:'Invalid request body'}`; `400 {error:'Notification id is required'}` | `src/routes/api/notifications/+server.ts:40-68` |
| `/api/push/public-key` | GET | none | none | `200 {publicKey: string\|null}` — null when `VAPID_PUBLIC_KEY` unset | none | `src/routes/api/push/public-key/+server.ts:5-7` |
| `/api/push/subscribe` | POST | signed-in | `{endpoint: string, keys:{p256dh: string, auth: string}}`; all four non-empty strings, no nulls | `200 {success:true}` (upsert by endpoint) | `401 {error:'Unauthorized'}`; `400 {error:'Invalid subscription payload'}` | `src/routes/api/push/subscribe/+server.ts:28-42` |
| `/api/push/unsubscribe` | POST | signed-in | `{endpoint: non-empty string}` | `200 {success:true}` (deletes only caller's row) | `401 {error:'Unauthorized'}`; `400 {error:'Invalid request body'}` | `src/routes/api/push/unsubscribe/+server.ts:26-42` |
| `/api/me/notification-preferences` | GET | signed-in | none; never writes | `200 {preferences:{taskAssigned,taskCompleted,familyJoined,aiSuggestions}, options:[{id,label,hint,default}]}` | `401 {error:'Unauthorized'}` | `src/routes/api/me/notification-preferences/+server.ts:12-22` |
| `/api/me/notification-preferences/[id]` | PUT | signed-in | `{value: boolean}`; absent/non-boolean → 400; `id` must be one of the four ids | `200 {success:true, message}` — message `<Label> alerts are on.`/`off.` + ` Saved.` | `401 {error:'Unauthorized'}`; `400 {error:'Unknown notification preference'}`; `400 {error:'Notification preference value is required'}`; `500 {error:'<Label> alerts are on/off. This did not save.'}` | `src/routes/api/me/notification-preferences/[id]/+server.ts:12-26`; `src/lib/server/services/accountData.ts:246-257` |

### Rules the module must keep
- Closed Alert set of five: `assignment_pending`, `assignment_accepted`, `assignment_declined`, `task_completed`, `added_to_family`; the guard rejects non-strings, case variants and unknown values — `src/lib/utils/notificationTypes.ts:14-31` · test: `src/lib/utils/notificationTypes.test.ts` › "is exactly the five-member union"
- Group is a property of the type: only `assignment_pending` and `assignment_declined` are **needs you**; every other type — including an unrecognised one — is **news** — `src/lib/utils/notificationTypes.ts:40-52` · test: `notificationTypes.test.ts` › "never lets an unrecognised type claim to need a decision"
- Labels: Asked you / Accepted / Declined / Completed / Added to family; an unknown type renders as `Update`, never echoing the raw column — `src/lib/utils/notificationTypes.ts:54-68` · test: `notificationTypes.test.ts` › "labels an unrecognised type explicitly rather than echoing the raw string"
- An unrecognised row is kept, never dropped: `type: null`, `rawType` preserved, group derived from the raw value, `link`/`readAt` normalised to null — `src/lib/utils/notificationTypes.ts:127-142` · test: `notificationTypes.test.ts` › "keeps an unrecognised row rather than dropping or crashing on it"
- The Alerts page load logs the distinct unrecognised types server-side and redirects an anonymous visitor 302 to `/login` — `src/routes/(calendar)/calendar/notifications/+page.server.ts:10-25` · test: `page.server.test.ts` › "logs an unrecognised type server-side so a bad write is visible"
- One feed, one page size: 50 rows, newest `createdAt` first, shared by the bell API and the Alerts page — `src/lib/server/db/actions/notifications.ts:39-51` · test: `page.server.test.ts` › "reads the same page size the notifications API reads"
- Creating an Alert inserts then fires a push (title = actorName, body = message, link default `/calendar/tasks`) without awaiting it; a failed write is logged, never thrown — `src/lib/server/db/actions/notifications.ts:6-27`
- Mark read/mark all are scoped to the caller's `userId`; mark-all touches only rows with `readAt IS NULL` — `src/lib/server/db/actions/notifications.ts:61-75` · test: `notifications.test.ts` › "deletes from notifications, always behind a WHERE clause"
- Pruning deletes only read rows and returns the count; unread Alerts are never pruned — `src/lib/server/db/actions/notifications.ts:81-100` · test: `notifications.test.ts` › "never deletes unread notifications"
- The weekly cron prunes read Alerts older than 90 days (unread ones stay forever) — `src/routes/api/cron/cleanup/+server.ts:15,41-43` · test: `notifications.test.ts` › "deletes only read notifications older than the cutoff"
- Filter chips count over the whole loaded feed, never over the active filter — `src/lib/utils/notificationTypes.ts:148-190` · test: `page.svelte.test.ts` › "keeps its counts while a filter is active, so a chip number never moves"
- Preferences are four fixed switches in this order — Task assigned to me (In-app and push, on), Task completed (In-app and push, on), Someone joined the family (In-app only, **off**), AI event suggestions (Uses your AI allowance, on) — `src/lib/components/account/accountNotifications.ts:37-88` · test: `accountNotifications.test.ts` › "defaults to on, on, off, on — \"Someone joined the family\" is the only opt-in"
- Stored preferences live in `activeSubscriptions.notificationMethods.preferences`; only real booleans count, missing/partial/malformed bags read as defaults, and a read never writes — `src/lib/components/account/accountNotifications.ts:120-141`; `src/lib/server/db/actions/notificationMethods.ts:50-59` · tests: `notificationMethods.test.ts` › "shows the approved defaults to an account with no subscription row, and writes nothing"
- A save copies the legacy billing half `{email, sms}` through untouched and only rewrites `preferences` — `src/lib/components/account/accountNotifications.ts:144-160` · test: `accountNotifications.test.ts` › "survives a full round trip: legacy row in, legacy row still readable out"
- When no subscription row exists, the first toggle inserts a tierless row (`subscriptionTypeId: null`, `endDate` 9999-12-31, `email:false, sms:false`) so it stays out of every plan read and claims no channel consent — `src/lib/server/db/actions/notificationMethods.ts:68-97` · test: `notificationMethods.test.ts` › "creates a tierless row when the account has none, claiming no channel consent"
- The preferences row is the user's newest unexpired row (`endDate > now` or null), tier not required — `src/lib/server/db/actions/notificationMethods.ts:26-45`
- A failed preference save reverts the optimistic switch and reports `<Label> didn’t save — try again.` — `src/lib/components/account/accountNotifications.ts:191-210` · test: `accountNotifications.test.ts` › "puts the switch back where the server still has it when the save fails"
- Push fan-out runs the web and device channels in parallel via `allSettled`; one failing channel never blocks the other and the call never rejects — `src/lib/server/services/pushService.ts:83-95` · test: `pushService.test.ts` › "one channel failing never blocks the other or rejects"
- Web Push skips silently when VAPID is unset; a 404/410 from the push service deletes that caller's subscription row, other failures are logged — `src/lib/server/services/pushService.ts:98-145`
- Visible FCM message: `data {type:'notification', link?}` + notification title/body + android high priority. Silent `events_changed`: data-only `{type, actorId}`, `collapse_key: 'events_changed'`, `ttl: '600s'` — `src/lib/server/services/fcmService.ts:95-119` · test: `devicePushService.test.ts` › "sends one data-only events_changed message per token across users (users deduped)"
- Device tokens upsert by token (re-owning it to the caller and refreshing `lastSeenAt`), delete is caller-scoped, audience/tokens are deduped, only `'unregistered'` tokens are pruned, fan-out never throws and does no DB read when FCM is unconfigured — `src/lib/server/services/devicePushService.ts:23-86` · tests: `devicePushService.test.ts` › "prunes tokens FCM reports unregistered, keeps the rest", "skips silently (no db read) when FCM is not configured"
- The `events_changed` audience includes the actor; the message carries `actorId` so the actor's own phone refreshes silently instead of announcing an update (#281) — `src/lib/server/services/eventsChangedNudge.ts:13-23,70`
- Push enable asks permission inside the click (before any I/O), requires a secure context and an existing service worker, reuses an existing subscription, and unsubscribes locally when the server rejects it — `src/lib/utils/pushClient.ts:89-170` · tests: `pushClient.test.ts` › "reuses an existing subscription instead of calling subscribe(), then posts it", "returns no-service-worker when no registration exists (avoids hanging on .ready)"

### Page and UI behaviour worth keeping
- Bell: 44×44 trigger, unread badge capped at `99+`, unread count polled from `/api/notifications` every 60s, empty copy "No notifications yet — all quiet on the home front.", load failure offers Retry — `src/lib/components/NotificationBell.svelte:156-158,176,192,209-219` · test: `NotificationBell.svelte.test.ts` › "is 44px square"
- Bell row tap closes the dropdown, marks the row read optimistically, then navigates to `link`; a failed POST restores unread and toasts "Couldn't mark that alert read — it stays in your list." — `src/lib/components/NotificationBell.svelte:70-86` · test: `NotificationBell.svelte.test.ts` › "says so when marking read fails instead of swallowing it"
- Alerts header: `N unread` or "You're all caught up"; chips All / Needs you / Unread with counts; a section with no rows is omitted; "Nothing matches this filter." when the filter empties the feed — `src/routes/(calendar)/calendar/notifications/+page.svelte:187,247,266,270`
- Empty feed: "No alerts yet" plus an explanation naming assignment, accept, decline, complete and family-add Alerts — `src/routes/(calendar)/calendar/notifications/+page.svelte:239`
- Unread rows are washed in the brand peach and bolder; read rows are not — `src/routes/(calendar)/calendar/notifications/+page.svelte:156,290-291` · test: `page.svelte.test.ts` › "washes an unread row, and only an unread row"
- Row is a real `<a href>`: plain click marks read then navigates; modified clicks are left to the browser; an already-read row navigates without a POST — `src/routes/(calendar)/calendar/notifications/+page.svelte:109-135` · tests: `page.svelte.test.ts` › "leaves a modified click to the browser so open-in-new-tab still opens", "does not re-POST a row that is already read"
- "Delete read alerts" asks inline ("Delete N read alert(s)?", Delete them / Keep them), then toasts `Deleted N read alert(s).`; failure restores the rows — `src/routes/(calendar)/calendar/notifications/+page.svelte:87-104,196-222`
- "Mark all read" updates optimistically, toasts "Everything marked as read.", reverts on failure — `src/routes/(calendar)/calendar/notifications/+page.svelte:67-85`
- Bell push section: "Enable push notifications", "Push notifications enabled.", "Push notifications on" + "Turn off", "Notifications blocked in browser settings." — `src/lib/components/NotificationBell.svelte:283-304`

### Probably accidental (candidates to drop, owner to confirm)
- `DELETE /api/devices` runs the shared parser, so `{token, platform:'ios'}` is a 400 even though DELETE ignores platform — `src/routes/api/devices/+server.ts:32-40,55-64` — why: a field with no effect rejects the request
- `/api/push/public-key` publishes the key whenever `VAPID_PUBLIC_KEY` is set, even with no private key, so a client can "enable" push that can never send — `src/lib/server/services/pushService.ts:29-40,99` — why: configured-ness is only checked at send time
- `createNotification` defaults every Alert's link to `/calendar/tasks`, including `added_to_family` — `src/lib/server/db/actions/notifications.ts:21-25` — why: wrong deep link for non-task Alerts
- Bell passes `notification.rawType ?? notification.type` into the label tables although `rawType` is always a string — `src/lib/components/NotificationBell.svelte:238,255` — why: dead fallback
- There is no unread-count endpoint; the bell refetches the full 50-row feed just to poll a number — `src/lib/components/NotificationBell.svelte:31-45,156-158` — why: acknowledged in-code gap
- `notificationSaveOutcome` computes the failure state as `!intent.value` rather than the last server value — `src/lib/components/account/accountNotifications.ts:201-209` — why: only correct if `current` is exactly the optimistic flip
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#186](../../archive/issues/186-no-queues.md) Retries/backoff/DLQ for email and push. | STRUCTURE | keep; separate ticket (ports make it a one-adapter change) |

## Plan

### New files (S1 design; every one lands in `src/lib/domains/alerts/` or its `ui/`)

| file | role | what goes in it |
|---|---|---|
| `alerts.contract.ts` | contract | One zod schema + inferred type per wire body/response: `AlertRow`, `AlertFilter`, `AlertListResponse`, `AlertsMarkBody`, `DeviceRegistrationBody`, `PushSubscriptionBody`, `AlertPreferencesResponse`, `AlertPreferenceBody`, plus the device-token length/platform constants the 400 wording depends on. Module-internal page/action inputs get schemas too. |
| `alerts.vocabulary.rules.ts` | rules | The five-type closed set and guard, needs-you/news split, labels, tones, glyphs, `toAlertRow` (unknown → `type:null`, `rawType`, news), `unrecognisedAlertTypes`. Replaces `src/lib/utils/notificationTypes.ts:1-142`. |
| `alerts.feed.rules.ts` | rules | `ALERT_PAGE_SIZE` (50), `filterAlerts`, `groupAlerts`, `alertCounts` (counts over the whole feed). Replaces `notificationTypes.ts:148-190` and owns the page size for bell + page. |
| `alerts.preferences.rules.ts` | rules | The four switches in order (labels/hints/defaults), stored-bag parse (real booleans only), write-one-preference that copies `email`/`sms` through, receipt label, save outcome (revert + copy). Replaces `src/lib/components/account/accountNotifications.ts:20-210`. |
| `alerts.push.rules.ts` | rules | FCM message builders (visible `notification` + `data.link`; silent `events_changed` with `actorId`, collapse key, TTL), token dedupe, prune predicate for `'unregistered'` and web-push 404/410, token length/platform vocabulary. Replaces `fcmService.ts:95-119` and the pure half of `devicePushService.ts:18-21,60-86`. |
| `alerts.repo.server.ts` | repo | Every query for `notifications`, `pushSubscriptions`, `deviceTokens`, and the declared foreign read/update of `activeSubscriptions.notificationMethods`: feed window + unread count, mark read/mark all, delete read, delete read older than, subscription upsert/delete/list, device upsert/delete/list, preference row find/insert/update. Replaces `notifications.ts` (all queries), `notificationMethods.ts:26-97`, `pushService.ts:42-70`, `devicePushService.ts:23-58`. |
| `alerts.service.server.ts` | service | Use-cases `(ctx, actor, input)` with scoping in one place: `createAlert`, `listAlertFeed`, `markAlertRead`, `markAllAlertsRead`, `pruneReadAlerts`, `pruneReadAlertsOlderThan`, `getAlertPreferences`, `setAlertPreference`, `registerDevice`, `unregisterDevice`, `getPushPublicKey`, `savePushSubscription`, `removePushSubscription`, `nudgeEventsChanged`; the private fan-out (web push + FCM in parallel, `allSettled`, never rejects) and its injectable channel seam. Replaces `notifications.ts:6-27`, `pushService.ts:71-147`, `devicePushService.ts:60-117`, the transport half of `eventsChangedNudge.ts`. |
| `alerts.http.server.ts` | http | `endpoint()` definitions for the nine `/api` methods and `pageLoad()` for `/calendar/notifications`; parses through the contract, calls exactly one service, reproduces the legacy status/bodies/messages. Replaces all 7 route handler bodies and the page load. |
| `alerts.api.ts` | api | `alertsApi` on the kernel client: list, mark, markAll, prune, registerDevice, unregisterDevice, publicKey, subscribePush, unsubscribePush, getPreferences, setPreference. Replaces the fetch calls in `NotificationBell.svelte` and the Alerts page. |
| `alerts.pushClient.ts` | api | Browser push flow: state, permission inside the click, secure-context/service-worker checks, reuse an existing subscription, local unsubscribe on server rejection. Replaces `src/lib/utils/pushClient.ts` (all). |
| `alerts.state.svelte.ts` | state | Alerts page state: feed + counts, filter, mark/mark-all optimistic + revert, delete-read confirm, toasts. Absorbs the page's inline logic (`+page.svelte:32-135`). |
| `alertsBell.state.svelte.ts` | state | Bell state: unread badge (capped `99+`), 60 s poll, mark-read-then-navigate, failure restore + toast, push section state. Absorbs `NotificationBell.svelte:26-160`. |
| `alerts.fixtures.server.ts` | fixtures | Created in S2: `seedAlert`, `seedDeviceToken`, `seedAlertPreferencesRow` (direct inserts; no service call, so no push). Extend it when the repo/service tests need more rows. |
| `ui/AlertsBell.svelte` | ui | The bell, on kernel ui primitives. Replaces `NotificationBell.svelte`. |
| `ui/AlertsFeed.svelte` | ui | Header, empty states, the `Needs you` / `Just news` sections; composes toolbar + rows. Replaces `+page.svelte` markup. |
| `ui/AlertsToolbar.svelte` | ui | Header count, the three chips, mark-all and delete-read (kernel `ConfirmAction`). |
| `ui/AlertsRow.svelte` | ui | One Alert as an `<a href>`: unread wash, tone/glyph/label, plain vs modified click, already-read no POST. |
| `ui/PushToggle.svelte` | ui | Enable/disable browser push with the four approved strings. |
| `ui/index.ts` (fill) | entry | Re-export the five components. |
| `index.ts` (fill) | entry | Contract, vocabulary/feed/preference rules, `alertsApi`, push client — as designed in the README. |
| `index.server.ts` (fill) | entry | Services + endpoint handlers — as designed in the README. |
| `alerts.vocabulary.rules.test.ts` | test | Closed set, group, labels, decode, unrecognised logging list. |
| `alerts.feed.rules.test.ts` | test | Filter, grouping order, chip counts over the whole feed, page size. |
| `alerts.preferences.rules.test.ts` | test | Four switches order/defaults, stored-bag parse (missing/partial/malformed/non-boolean), write-one copies the billing half, receipt copy, save outcome. |
| `alerts.push.rules.test.ts` | test | FCM message shapes, dedupe, prune predicate. |
| `alerts.pushClient.test.ts` | test | Browser push flow: permission inside the click, no service worker, reuse an existing subscription, local unsubscribe on server reject. |
| `alerts.repo.db.test.ts` | test | `rollbackTest` per query with a filter/order/upsert. |
| `alerts.service.db.test.ts` | test | Every IO invariant: scoping, prune counts, tierless row, channel fan-out with fakes, nudge. |
| `alerts.state.test.ts` / `alertsBell.state.test.ts` | test | State classes with a fake `alertsApi`, no DOM. |
| `ui/AlertsBell.svelte.test.ts` / `ui/AlertsFeed.svelte.test.ts` / `ui/AlertsRow.svelte.test.ts` | test | Rendering and interaction. |

### Where each legacy export goes

| legacy | destination |
|---|---|
| `createNotification` | service `createAlert` (insert + unawaited push, write failure logged never thrown). |
| `getNotifications`, `getUnreadCount` | repo `listAlerts` / `countUnreadAlerts`, both behind service `listAlertFeed`. |
| `NOTIFICATION_PAGE_SIZE` | `ALERT_PAGE_SIZE` in feed rules. |
| `markNotificationRead`, `markAllNotificationsRead`, `deleteReadNotifications`, `pruneReadNotificationsOlderThan` | repo queries + services `markAlertRead`, `markAllAlertsRead`, `pruneReadAlerts`, `pruneReadAlertsOlderThan`. |
| `notificationTypes.ts` exports | vocabulary or feed rules; `NotificationRow` becomes contract `AlertRow`; `NotificationFilter` → `AlertFilter`. |
| `accountNotifications.ts` exports | preferences rules; `notificationSaveOutcome` becomes `saveOutcome`; the card's `NotificationPreference*` types become contract types. |
| `findNotificationMethodsRow` | repo `findAlertPreferencesRow` (newest unexpired, tier not required). |
| `getNotificationPreferences`, `setNotificationPreference` | services `getAlertPreferences`, `setAlertPreference`. |
| `getVapidPublicKey` | service `getPushPublicKey`. |
| `saveSubscription`, `removeSubscription` | repo upsert/delete + services `savePushSubscription`, `removePushSubscription`. |
| `sendPushToUser`, `sendWebPushToUser` | private fan-out inside the service (channels injected; no export). |
| `registerDeviceToken`, `removeDeviceToken` | services `registerDevice`, `unregisterDevice` over repo upserts/deletes. `MAX_DEVICE_TOKEN_LENGTH` / `DEVICE_PLATFORMS` move to the contract. |
| `fanOut`, `sendNotificationToDevices`, `sendDataToUsers` | private fan-out + `nudgeEventsChanged`; the `'unregistered'` prune stays a rule. |
| `nudgeEventsChanged` (transport) | service `nudgeEventsChanged(ctx, actor, {userIds})`. `realCalendarAudience` and `getAccessibleCalendarIds` **die here**: `calendar`/`family` own those tables, alerts rank 3 must not read them (R1); calendar resolves the audience and passes the ids (actor included). |
| `pushClient.ts` exports | `alerts.pushClient.ts`, same behaviour. |
| `NotificationBell.svelte` | `ui/AlertsBell.svelte` + `alertsBell.state.svelte.ts`. |
| `+page.server.ts` load | `pageLoad()` in `alerts.http.server.ts` (same 50-row window, same unknown-type log, 302 to `/login`). |
| `+page.svelte` | `ui/AlertsFeed.svelte` + toolbar/row components; the route becomes wiring. |
| `accountNotifications` card markup | not this module: the account screen composes the switches from this module's `index.ts` at its own port. |
| `web-push.d.ts` | dies with the legacy `web-push` import; the typed transport lives with the push adapter (kernel port, see Notes). |


## Notes

**Verified against the code (S1).** The draft's API table holds. Corrections and additions:

- The PUT preference refusal for a non-object body is `400 {"error":"Invalid JSON"}` (from `readJsonObject`), not `Invalid request body`; an empty body reads as `{}` and gets `Notification preference value is required`.
- The draft's `POST /api/notifications` row says "non-object → 400 Invalid request body": an **array** is an object to `isNotificationBody` (`typeof value === 'object' && value !== null`), so it falls through to `400 Notification id is required`. Only a string, `null`, malformed JSON or an empty body get `Invalid request body`. The golden tables pin that split.
- `GET /api/me/notification-preferences` has no 500 path: `loadNotificationPreferences` catches a read failure and answers the defaults (`accountData.ts:131-136`).
- The sheet's `notificationMethods.ts:50-59` is the read; the "only real booleans count" rule lives in `accountNotifications.ts:120-137`, and the newest-unexpired-row filter is `notificationMethods.ts:26-45`.
- Seven `/api` route files / nine methods (the sheet's "9 routes" counts the two page files). `/api/cron/cleanup` stays app-owned; alerts exports only `pruneReadAlertsOlderThan` and the 90-day constant stays in the cron.
- No alerts route has a rate limit, so there are no 429 goldens. There is no 403/404 semantics: cross-user ids are silently scoped (200 no-op), an unknown preference id is a 400.
- Push is never contacted by these routes; no golden observes a push. `createAlert`'s push and the FCM/web-push fan-out are S5 service tests with the channel seam, so tests never reach Firebase or a push service.

**S2 goldens.** All seven `/api` route files (nine methods) are covered. The file is ~1170 lines because it pins every method's full success body and every refusal; the playbook keeps one `<m>.http.db.test.ts` per module, so it is not split by topic. The two `/api/me/notification-preferences` describes are marked `golden from spec: legacy handler not runnable here` — their legacy route imports `accountData → $lib/utils/sendEmail → $env/static/private`, which the db project does not provide (the Resend constructor also throws when the key is missing). They are imported dynamically and skipped at S2; from S6 the import resolves and they run unedited. The preference 500 (`<change> This did not save.`) cannot be produced in an http golden (it needs a write failure); S5 pins it with a failing db.

**Probably accidental — kept on the wire, owner question below.**

- `DELETE /api/devices` runs the shared parser, so `{token, platform:'ios'}` is a 400 even though DELETE ignores the platform. Kept (an installed client sends `android`; tightening or loosening is a wire change) and pinned by `DELETE /api/devices › validates the platform even though DELETE ignores it`.
- `/api/push/public-key` publishes the key whenever only `VAPID_PUBLIC_KEY` is set, so a browser can "enable" push that can never send (`isVapidConfigured` needs both halves). Kept and pinned by the public-key goldens.
- `createAlert`'s push tap target defaults to `/calendar/tasks` for every type, including `added_to_family`. Kept as today's push contract and pinned by the S5 fan-out test; per-type links would be a push-contract ticket.

**Probably accidental — internal, dropped.**

- `NotificationBell.svelte` passes `rawType ?? notification.type` into the label tables although `rawType` is always a string (`:238,255`): dead fallback, gone from the new bell.
- `notificationSaveOutcome` computes the reverted switches as `!intent.value` rather than the last server value (`:191-210`): only correct while `current` is exactly the optimistic flip. The new state class captures the server value before flipping and restores that; the copy (`<Label> didn’t save — try again.`) survives unchanged.
- The bell refetches the full 50-row feed every 60 s because there is no unread-count endpoint (`:31-45,156-158`): that is an acknowledged gap, not a rule. The wire is fixed, so the bell keeps polling the same GET; a count endpoint would be an Android-contract ticket (question below). No new endpoint in this port.

**Boundary decision (R1).** The `events_changed` audience (calendar owners + family members + the actor's accessible calendars) is resolved by `calendar`/`family`, which own those tables; `alerts` only transports the message to the user ids it is given and dedupes tokens. `eventsChangedNudge.ts`'s audience SQL dies here; the ids-in contract is pinned by an S5 test and must be re-created in `calendar` at its port. `#186` (retry/backoff/DLQ) stays a separate ticket: the channel seam is the one-adapter change.

**Push transport and config.** FCM signing/HTTP lives in `src/lib/server/services/fcmService.ts`, which the kernel sheet owns (kernel task list, `push` kind); alerts imports the kernel port once it exists. VAPID/FCM config must reach the service through `ctx.config` — rule R6 forbids `process.env` outside `src/lib/app`, and the legacy read at the service edge is exactly what the port removes. That means a `push` section on the kernel `Ctx.config` (populated once in `src/lib/app/appCtx.server.ts`), a kernel-side change alerts depends on; until it lands S5 cannot wire real transports, and the service keeps the injectable channel seam so tests never reach Firebase or a push service. Nothing in the module logs request bodies or tokens.

**Files kept for unported importers.** None of the alerts legacy files can be deleted yet: `notificationTypes.ts`, `notifications.ts`, `pushService.ts`, `devicePushService.ts`, `eventsChangedNudge.ts` and `notificationMethods.ts` are imported by tasks/family/calendar routes and `accountData`; they go at S8 or when those modules port, whichever comes last.

### Questions for the owner

1. **DELETE /api/devices validates `platform` it ignores.** (Q-019) Context: the shared parser 400s `{token, platform:'ios'}` on DELETE though no platform is stored or changed. Options: (a) keep the shared parser (today's wire, no client churn likely); (b) let DELETE ignore an unrecognised platform. Recommendation: (a) — nothing is broken for the Android client and a wire change needs its own ticket.
2. **`/api/push/public-key` without a private key.** (Q-020) Context: a client can subscribe while the server can never send; the client shows "Push notifications enabled." Options: (a) keep publishing `VAPID_PUBLIC_KEY` (today); (b) answer `null` unless both halves are configured, so the toggle hides itself. Recommendation: (b) as a separate owner-approved wire ticket; the golden pins (a) meanwhile.
3. **Alert push deep link defaults to `/calendar/tasks` for every type.** (Q-021) Context: `added_to_family` and `task_completed` land on the tasks page. Options: (a) keep one default; (b) per-type links (`/calendar/family`, `/calendar/tasks`). Recommendation: (b) later, as a push-contract ticket; the fan-out rule stays one default until then.
4. **No unread-count endpoint.** (Q-022) Context: the bell polls the whole 50-row feed to show a number every 60 s. Options: (a) keep the poll (no wire change); (b) add `GET /api/notifications/unread-count` for Android and the bell. Recommendation: (a) in this port; (b) is an Android-contract addition that needs its own ticket and spec entry.


## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# alerts: 0% ported

legacy source files left (9/9, 1378 LOC):
  - src/lib/components/NotificationBell.svelte (311 LOC, ui) importers: 2
  - src/lib/components/account/accountNotifications.ts (210 LOC, model) importers: 6
  - src/lib/server/db/actions/notificationMethods.ts (98 LOC, server) importers: 1
  - src/lib/server/db/actions/notifications.ts (101 LOC, server) importers: 6
  - src/lib/server/services/devicePushService.ts (117 LOC, server) importers: 3
  - src/lib/server/services/pushService.ts (147 LOC, server) importers: 4
  - src/lib/server/services/web-push.d.ts (16 LOC, server) importers: 0
  - src/lib/utils/notificationTypes.ts (187 LOC, model) importers: 4
  - src/lib/utils/pushClient.ts (191 LOC, client) importers: 1

route files not yet wiring-only (9/9):
  - src/routes/(calendar)/calendar/notifications/+page.server.ts  /calendar/notifications
  - src/routes/(calendar)/calendar/notifications/+page.svelte  /calendar/notifications
  - src/routes/api/devices/+server.ts  /api/devices
  - src/routes/api/me/notification-preferences/+server.ts  /api/me/notification-preferences
  - src/routes/api/me/notification-preferences/[id]/+server.ts  /api/me/notification-preferences/[id]
  - src/routes/api/notifications/+server.ts  /api/notifications
  - src/routes/api/push/public-key/+server.ts  /api/push/public-key
  - src/routes/api/push/subscribe/+server.ts  /api/push/subscribe
  - src/routes/api/push/unsubscribe/+server.ts  /api/push/unsubscribe

legacy test files left (13/13) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/components/NotificationBell.svelte.test.ts [component, 5 tests]
  - src/lib/components/account/accountNotifications.test.ts [pure, 20 tests]
  - src/lib/server/db/actions/notificationMethods.test.ts [stub-db, 8 tests]
  - src/lib/server/db/actions/notifications.test.ts [stub-db, 6 tests]
  - src/lib/server/services/devicePushService.test.ts [pure, 7 tests]
  - src/lib/server/services/pushService.test.ts [pure, 2 tests]
  - src/lib/utils/notificationTypes.test.ts [pure, 21 tests]
  - src/lib/utils/pushClient.test.ts [pure, 9 tests]
  - src/routes/(calendar)/calendar/notifications/page.server.test.ts [route, 8 tests]
  - src/routes/(calendar)/calendar/notifications/page.svelte.test.ts [component, 16 tests]
  - src/routes/api/devices/server.test.ts [route, 7 tests]
  - src/routes/api/notifications/server.test.ts [route, 2 tests]
  - src/routes/api/push/unsubscribe/server.test.ts [route, 3 tests]
```
<!-- census:end -->
