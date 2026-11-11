# Research: Google Calendar sync for Family Planz

Checked: **2026-09-30**. Primary sources only (Google docs/help, IETF RFCs, npm registry, Vercel docs, repo files). Anything I could not confirm from a primary source is tagged **UNVERIFIED**.

## Verdict

Google sync is possible on every rung, and the cheapest rung is a plain read-only `.ics` feed — no OAuth, no scopes, no Google Cloud project, no verification. Cheapest route: a new unauthenticated tokenised feed endpoint at `GET /feed/{token}.ics` re-exporting the existing `buildIcsEvent` machinery; effort **S** (~1–2 days) and it ships inside the app's existing **Anonymous Account** model because no Google account is needed. Two-way push is **L** and is architecturally wrong for this deployment: `events.watch` channels expire (default TTL 604800s per the reference) and must be re-`watch`ed weekly, and Vercel has no long-lived process to receive or renew them, so two-way would degrade to polling, which is worse than just using the API on demand. Top 3 blockers: (1) Google has **removed password/basic-auth CalDAV** — `caldav.googleapis.com` is now OAuth-only and returns 401 on basic auth, so no shortcut route exists; (2) every Calendar API scope is a **sensitive** scope, triggering brand + additional app verification with a demo video before any public launch, and the app currently has no Google Cloud project; (3) the repo's ICS layer has **no UID round-trip and no `RECURRENCE-ID`** — exceptions currently re-emit the master's UID with no recurrence id, which is a malformed VEVENT, and the importer drops `UID` and skips `STATUS:CANCELLED`, so nothing deletion- or identity-aware is proven today.

## Route ladder

| # | Route | Direction | Effort | OAuth | Google Cloud project | Verification | Deployable on Vercel? |
|---|-------|-----------|--------|-------|----------------------|--------------|----------------------|
| 1 | Remote ICS subscription | in → Google (read-only mirror) | **S** | no | no | no | yes (static feed route) |
| 2 | Calendar API v3 read | Google → app | **M** | yes | yes | sensitive scopes | yes (on-demand) |
| 3 | Calendar API v3 two-way | both | **L** | yes | yes | sensitive scopes | degraded → polling |
| 4 | CalDAV | both | **L** + dead-end risk | yes (mandatory) | yes (+`caldav.googleapis.com`) | sensitive scopes | yes, but pointless |
| 5 | Add-to-Calendar render URL (already shipped) | out → Google (one event, manual) | **done** | no | no | no | yes |

---

## 1. Remote ICS subscription (one-way, read-only feed) — S

**Can a Google Calendar user subscribe to an externally-hosted .ics URL?** Yes. Path: *Other calendars → + → From URL*, paste the URL, *Add calendar*. Lands under "Other calendars" and syncs to the mobile apps. <https://support.google.com/calendar/answer/37100>

- **Desktop web only for the subscribe step.** "To subscribe to a new calendar, you must use a computer web browser. You can't subscribe to a calendar in the Google Calendar app for Android, iPhone, or iPad." (same page). Subscribe once on desktop → it propagates to signed-in devices.
- **URL scheme.** The official help page only ever says "Enter the URL of the published calendar" (37100) and, for *Google-sourced* feeds, "Public address in iCal format" / "Public URL to this calendar" (<https://support.google.com/calendar/answer/37083>). Google's own published values are **https**. `webcal://` is a client-side convention for clickable subscribe links and is **not** in any Google primary source → treat `webcal://` as **UNVERIFIED for Google**. Ship `https://…/feed/<token>.ics`; optionally add a `webcal://` variant as a nicety, never as the only URL.
- **Refresh cadence — undocumented in the current help page.** The live page (checked 2026-09-30) contains **no** refresh-interval statement. The trajectory, from Wayback captures of the same official article:
  | Snapshot | Official wording |
  |---|---|
  | 2023-01-04 | "It might take up to **12 hours** for changes to show in your Google Calendar." — <https://web.archive.org/web/20230104120833/https://support.google.com/calendar/answer/37100> |
  | 2024-03-02 | "It might take up to **24 hours**…" — <https://web.archive.org/web/20240302080527/https://support.google.com/calendar/answer/37100> |
  | 2024-06-01 | "It might take up to **24 hours**…" — <https://web.archive.org/web/20240601040519/https://support.google.com/calendar/answer/37100> |
  | 2024-09-01 onward | statement **removed** — <https://web.archive.org/web/20240901112344/https://support.google.com/calendar/answer/37100> |
  So: the last *official* number is **24h**, and Google has since declined to commit. The widely-cited "8–24h / every 12h" community figures are **UNVERIFIED** (no Google primary source). Design for **≥24h staleness**; never promise same-day. No manual refresh button and no user-configurable interval exist in any Google source → **UNVERIFIED** that a force-refresh exists.
- **ETag / Last-Modified.** **No Google primary source** states whether Google's feed fetcher honours conditional requests. Do not rely on it: return `Cache-Control: no-cache, must-revalidate` (or short `max-age`) and accept that every fetch may be a full body. Google's fetcher also **respects `robots.txt`** for API push notifications (documented at <https://developers.google.com/workspace/calendar/api/guides/push>); whether the same crawler applies to "From URL" ICS fetches is **UNVERIFIED** — so the feed route must be reachable without auth challenge.
- **Deletions propagate?** RFC 5545 §3.8.1.11 `STATUS` permits `CANCELLED` on a `VEVENT` (<https://www.rfc-editor.org/rfc/rfc5545.html>, §3.8.1.11). A feed that simply *omits* a deleted VEVENT is ambiguous (omission can also mean "server truncated"). The only unambiguous, spec-sanctioned signal is `STATUS:CANCELLED` on the same UID. Whether Google honours it on a subscribed feed is **UNVERIFIED** — no Google primary source. **Consequence for this repo:** the current importer *skips* `STATUS:CANCELLED` events entirely (`src/lib/server/services/icsImportService.ts:186`) and caps the feed at 500 events (`icsImportService.ts:19`), so deletion propagation is not round-trippable today regardless of Google's behaviour.
- **Is the feed URL a secret?** Yes, by Google's own model, and the analogy is exact. Google's official help distinguishes a "Public address" (for sharing, appears in web search) from a "**Secret address in iCal format**", with the explicit instruction: "**Important: Only you should know the Secret Address for your calendar. Do not share this address with other people. If you accidentally shared your calendar's Secret Address, click Reset to create a new Secret Address.**" <https://support.google.com/calendar/answer/37106>. Also: un-sharing a public calendar "may take up to 4 hours to take effect" (37083) — i.e. revocation is not instant, so the token must be rotatable. **Design:** high-entropy per-family opaque token, stored hashed, rotatable, revocable, no enumerable ids.
- **Workspace vs consumer @gmail.** The "From URL" flow is a general consumer Calendar feature documented on the public Help Center (37100, 37083, 37106) with no Workspace-only caveat, and Workspace *admins* can restrict a user's calendar sharing settings, not the user's ability to subscribe. **However**: a Workspace admin controls OAuth app allowlisting and can block third-party apps outright — that affects routes 2–4, not route 1. Route 1 is Workspace-safe; UNVERIFIED whether a Workspace policy can block URL subscriptions.
- **Cost:** none. No Google API call, no quota, no account.

**Repo gap for this route:** the existing ICS endpoint is unusable as a subscription source — it is session-auth-gated (`src/routes/api/events/[id]/ics/+server.ts:23-25`) and sets `Content-Disposition: attachment` (`:87`). Google's fetcher carries no session cookie. A new tokenised, anonymous, whole-family feed route is required.

---

## 2. Google Calendar API v3 read-only (import into the app) — M

**Auth flow.** Authorization Code for web server applications. `state` for CSRF, `include_granted_scopes=true` for incremental auth, `login_hint` when the user is known, `prompt=consent` to force a fresh token. <https://developers.google.com/identity/protocols/oauth2/web-server>

**Scopes.** `events.list` authorizes with *any* of: `calendar.readonly`, `calendar`, `calendar.events.readonly`, `calendar.events`, `calendar.app.created`, `calendar.events.freebusy`, `calendar.events.owned`, `calendar.events.owned.readonly`, `calendar.events.public.readonly` (<https://developers.google.com/workspace/calendar/api/v3/reference/events/list>). Narrowest useful choice: **`calendar.events.readonly`** ("View events on all your calendars") for read; **`calendar.events`** for write. Their descriptions and the full Calendar v3 scope table: <https://developers.google.com/identity/protocols/oauth2/scopes>.

**Offline access / refresh tokens.**
- `refresh_token` is returned **only** if `access_type=offline` was set on the initial authorization request (web-server doc, token response section).
- "Refresh tokens are valid until the user revokes access or the refresh token expires."
- "If your application loses the refresh token, the user will need to repeat the OAuth 2.0 consent flow."
- "Your application should store both tokens in a secure, long-lived location" → in this app that means Postgres, encrypted at rest, and **not** `.env` (repo rule: never read/emit `.env*`).
- `prompt=consent` re-prompts and re-issues a refresh token — the escape hatch when a refresh token is rejected.
- Time-based access (`refresh_token_expires_in`) exists but is not required for `access_type=offline`; UNVERIFIED whether any Google-side idle-timeout forces re-consent for a Calendar app.
- **On revoke:** the refresh token stops working, access tokens expire, and `events.watch` channels created by that token can no longer be stopped by a different client (push guide, "Stop notifications": for a channel created by a regular user account, *only the same user from the same OAuth client ID* can stop it). Build a per-user "Google connection lost" state.

**Incremental sync.**
- Full sync once → store `nextSyncToken`; it appears **only on the last page** when paginated (<https://developers.google.com/workspace/calendar/api/guides/sync>).
- Incremental: repeat the *exact same* query with `syncToken`. "The result will always contain deleted entries" (cancelled events are included so clients can remove them) — and `showDeleted` may not be set to `False` with a `syncToken` (events.list reference).
- Incompatible with `syncToken`: `iCalUID`, `orderBy`, `privateExtendedProperty`, `q`, `sharedExtendedProperty`, `timeMin`, `timeMax`, `updatedMin`. Disallowed combos → HTTP **400**.
- Expired/invalidated token → HTTP **410**; must wipe local store and full-resync. Documented: "This should trigger a full wipe of the client's store and a new full sync."
- Legacy `modifiedSince` still exists for events but is "no longer recommended".

**Pagination limits.**
- `events.list` `maxResults`: **default 250, page size can never exceed 2500** (<https://developers.google.com/workspace/calendar/api/v3/reference/events/list>).
- `calendarList.list` `maxResults`: **default 100, can never exceed 250** (<https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list>).
- Also on the user: "If you subscribe to more than 400 calendars, you can encounter performance issues" (<https://support.google.com/calendar/answer/37100>).

**Rate / quota limits — as of the 2026-05-01 change.** <https://developers.google.com/workspace/calendar/api/guides/quota>
| Type | Limit |
|---|---|
| Per minute per project | **10,000** requests |
| Per minute per user per project | **600** requests |
| Per day per project (billing threshold) | **1,000,000** requests |
- Measurement: "Quotas are calculated per minute using a **sliding window**. A rapid burst of traffic that exceeds your per-minute quota during one minute will result in rate limiting during the next window." Two buckets: per-project and per-user-per-project. Handle 403 `rateLimitExceeded` / 403 `userRateLimitExceeded` / 429 with **truncated exponential backoff** (<https://developers.google.com/workspace/calendar/api/guides/errors>).
- Third bucket exists but is separate: 403 `quotaExceeded` = "Calendar usage limits exceeded", the anti-abuse limits that protect Google infrastructure.
- Free: "All standard use of the Google Calendar API is available at **no additional cost**." Exceeding the daily threshold is *planned* to incur charges, with "at least 90 days' notice before any changes take effect". The daily threshold "cannot" be raised.

**`singleEvents=true` expansion cost.** `singleEvents=true` "expand[s] recurring events into instances and only return[s] single one-off events and instances of recurring events, but not the underlying recurring events themselves" (events.list reference). A daily series running a year goes from 1 row to ~365 rows, and the app's 2500-row page cap then forces 1 page. Also note: `showDeleted` + `singleEvents` interaction — with both `true`, "only single instances of deleted events (but not the underlying recurring events) are returned". Google documents no separate quota cost for expansion, but the row multiplier is real. **For this repo, prefer the master + `events.instances` over a bounded window** — it matches the app's own "expanded virtually at read time" model exactly (`CONTEXT.md:32-34`).

**`freebusyQuery`.** <https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query> — POST with `timeMin`, `timeMax`, `timeZone`, `items[].id` (calendar ids or group ids). `calendarExpansionMax` **max 50**; `groupExpansionMax` **max 100** (error `groupTooBig` beyond). Returns `busy[] {start,end}` per calendar plus per-item `errors[]`. Scopes: `calendar.events.freebusy`, `calendar.freebusy`, or `calendar`. Cheap and quota-light — the right primitive for a "who's free" feature without mirroring a single event.

**`iCalUID` — does Google expose a stable per-event UID that survives an .ics round-trip?** Yes, and it is the *correct* join key. Official definition (<https://developers.google.com/workspace/calendar/api/v3/reference/events>):
> "Event unique identifier as defined in RFC5545. It is used to uniquely identify events accross calendaring systems and must be supplied when importing events via the `import` method. **Note that the `iCalUID` and the `id` are not identical and only one of them should be supplied at event creation time.** One difference in their semantics is that **in recurring events, all occurrences of one event have different `id`s while they all share the same `iCalUID`s.** To retrieve an event using its `iCalUID`, call the `events.list` method using the `iCalUID` parameter."

`id` is Google-internal and changes on move/import. `iCalUID` is the RFC 5545 §3.8.4.7 "persistent, globally unique identifier for the calendar component" and is **read-only** — Google generates it; you can only supply it on `events.import`. Round-trip plan: read `iCalUID` from Google, store it alongside the Family Planz event, and on write use `events.import` (not `insert`) when you need to control the UID.

---

## 3. Google Calendar API v3 two-way write + push notifications — L

**Writes.** `events.insert` / `update` / `patch` / `delete`. `sendUpdates` controls attendee email: `all` | `externalOnly` | `none`, default `false`. <https://developers.google.com/workspace/calendar/api/v3/reference/events/insert>
> "**Warning:** Using the value `none` can have significant adverse effects, including events not syncing to external calendars or events being lost altogether for some users. For calendar migration tasks, consider using the `events.import` method instead."

`events.insert` needs one of `calendar`, `calendar.events`, `calendar.app.created`, `calendar.events.owned`. Note `403 forbiddenForNonOrganizer` on shared-event properties (errors guide) — attendees cannot set `guestsCanModify` etc.

**Push notifications (`events.watch`).** <https://developers.google.com/workspace/calendar/api/guides/push>, <https://developers.google.com/workspace/calendar/api/v3/reference/events/watch>
| Property | Fact | Source |
|---|---|---|
| Endpoint | must be **HTTPS**; valid non-self-signed, unexpired, hostname-matching SSL cert required. Self-signed / untrusted-source / revoked / hostname-mismatch certs are explicitly rejected | push guide, "Create notification channels" |
| Delivery | HTTPS `POST`, user agent `APIs-Google`, **respects `robots.txt`** | push guide |
| Verification | No `X-Goog` handshake challenge is documented. The channel is considered live as soon as `watch` returns 200 — the client must be already publicly reachable. | push guide (absence) |
| Channel TTL | `params.ttl` — "**Default is 604800 seconds**" (7 days) | events/watch reference |
| Renewal | "Currently, there's **no automatic way to renew a notification channel**. When a channel is close to its expiration, you must replace it with a new one by calling the `watch` method." Expect an overlap period. | push guide, "Renew notification channels" |
| Payload | **No body.** Headers only (`X-Goog-Channel-ID`, `-Token`, `-Expiration`, `-Resource-ID`, `-Resource-URI`, `-Resource-State`, `-Message-Number`). "You will need to make another API call to see the full change details." | push guide |
| States | `sync` (on creation) / `exists` / `not_exists` | push guide |
| Success codes | 200, 201, 202, 204, 102. 500/502/503/504 → retried with backoff. Every other code = failure. | push guide |
| Scope | Per-calendar, per-user. Watch each calendar's events collection separately. Won't be notified when you *gain* access to a new collection. | push guide, "Special considerations" |
| Reliability | "**Notifications are not 100% reliable.** Expect a small percentage of messages to get dropped… Make sure to handle these missing messages gracefully, so that the application still syncs even if no push messages are received." | push guide |
| Max channels per user | **UNVERIFIED** — no documented cap in the push guide or the events/watch reference |

**Renewal cost.** A channel lives 7 days by default. Steady state = re-`watch` every ~6 days per (user × calendar) pair. For a family app with 1 Google calendar per claimed adult, that's ~6 watch calls per user per week — trivially inside the 600 req/min/user bucket, but it is a *recurring external dependency on a 7-day timer that can silently expire*.

**Is a long-lived push receiver feasible on Vercel? No.** Two independent blockers:
1. **Vercel Cron on Hobby fires at most once per day**, with ±59-minute scheduling precision. "Hobby accounts are limited to cron jobs that run **once per day**. Cron expressions that would run more frequently will fail during deployment." <https://vercel.com/docs/cron-jobs/usage-and-pricing>. This repo is on the weekly-cron-only pattern already: `vercel.json:2-7` has exactly one entry, `/api/cron/cleanup` at `0 4 * * 1`. A 7-day TTL cannot be renewed on a 1-day-granularity (or even 1-week) scheduler without risking expiry, and only Pro/Enterprise give per-minute cron.
2. **Vercel Functions are request-scoped, not daemons** — there is no long-lived process to hold a channel's receiving loop or a renewal timer. Even where the webhook `POST` itself would work fine (a stateless SvelteKit `+server.ts` can answer it), renewal is a scheduling problem, and the receiver has to stay publicly reachable and correctly answering at all times or Google drops the channel.

**Verdict on rung 3:** do not build `events.watch`. If two-way is wanted, use **pull-only incremental sync driven by a user action** (e.g. on app open) plus a daily cron sweep on Pro. That is strictly less machinery than push, has no 7-day timer, and matches the "notifications are not 100% reliable" caveat anyway — incremental `syncToken` polling is the officially recommended core loop (sync guide), with push documented as an *optimization* ("It lets you eliminate the extra network and compute costs involved with polling").

---

## 4. CalDAV against Google — L, and the shortcut is closed

**The single most decision-relevant fact: basic-auth CalDAV is dead.** Google's own CalDAV Developer's Guide (<https://developers.google.com/calendar/caldav/v2/guide>, page last updated 2026-09-03):
> "In either case, the connection **must be made over HTTPS and must use the OAuth 2.0 authentication scheme**. The CalDAV server **refuses to authenticate a request unless it arrives over HTTPS with OAuth 2.0 authentication** of a Google Account. **Attempting to connect over HTTP or using Basic Authentication results in an HTTP 401 Unauthorized status code.**"

Corroborating primary sources:
- Google Workspace Admin Help, "Transition from less secure apps to OAuth": "CalDAV, CardDAV, IMAP, SMTP, and POP will no longer work with legacy passwords (basic authentication)"; users trying a less-secure app for the first time "will not be able to", which "includes third-party apps that still use basic authentication, such as CalDAV, CardDAV, IMAP, SMTP, and POP" <https://knowledge.workspace.google.com/admin/sync/transition-from-less-secure-apps-to-oauth>. App passwords survive only for Google Apps/Workspace orgs that enable them — not available on consumer @gmail, and Google explicitly steers developers away: "If you use an app that uses password based CalDAV to give access to your calendar, **switch to a method that supports OAuth**."
- Google Workspace Updates, 2023-09-29, staged the shutdown: 2024-06-15 no new password-based CalDAV connections; 2024-09-30 off for all Workspace accounts <https://workspaceupdates.googleblog.com/2023/09/winding-down-google-sync-and-less-secure-apps-support.html>.
- Historical note: CalDAV was briefly partner-only in 2013, then re-opened publicly *with* OAuth 2.0 <https://developers.googleblog.com/making-googles-caldav-and-carddav-apis-available-for-everyone/>.

**So: app passwords are out. OAuth CalDAV is still supported and documented** — but it requires everything route 2 requires, **plus** enabling a second API (`caldav.googleapis.com`, a separate service from `calendar-json.googleapis.com`; UNVERIFIED whether Calendar API alone suffices — third-party reports say the CalDAV endpoint returns `403 accessNotConfigured` without it, which I could not confirm from a Google primary source), and it ships **the same OAuth consent screen and the same sensitive-scope verification** as the JSON API. It buys nothing the JSON API doesn't already give, at strictly more effort.

**Endpoints** (CalDAV guide):
- principal: `https://apidata.googleusercontent.com/caldav/v2/{CALENDAR_ID}/user`
- calendar collection: `https://apidata.googleusercontent.com/caldav/v2/{CALENDAR_ID}/events`
- "**Warning:** The old `https://www.google.com/calendar/dav` endpoint is deprecated and is no longer supported; use it at your own risk."

**Protocol gaps that hurt this repo specifically** (all from the same page):
- "**Doesn't support `VTODO` or `VJOURNAL` data.**" → Recurring **Tasks** are structurally un-syncable to Google, by any route.
- `rfc6638` (Scheduling): "Supports a trivial 'inbox,' which is always empty. Invitations you receive are automatically delivered into your 'events' collection." And "**Doesn't support `free-busy` lookup.**" → CalDAV is *worse* than the JSON API for availability.
- "Doesn't support the HTTP method `MKCALENDAR`" → can't create a calendar collection via CalDAV.
- `rfc4791`: "All reports except `free-busy-query` are implemented." `rfc4918`: `LOCK`/`UNLOCK`/`COPY`/`MOVE`/`MKCOL` unsupported.
- "**Note:** For account security and to prevent abuse, Google might set cookies on client applications that access data using CalDAV."
- "The CalDAV API has the **same quota limits as the Calendar API**."

---

## 5. Server-side helper libraries

Live query of the npm registry + npm downloads API, **2026-09-30** (downloads window 2026-09-22..2026-09-28).

| Package | Latest | Published | Downloads/wk | License | RRULE | UID round-trip | Notes |
|---|---|---|---|---|---|---|---|
| `googleapis` | 182.0.0 | 2026-09-24 | 11,961,117 | Apache-2.0 | via Calendar API `recurrence[]` | n/a (passes `iCalUID` to `import`) | Full generated client, huge dep tree. Overkill for 4 methods. |
| `google-auth-library` | 11.1.0 | 2026-09-16 | 109,574,519 | Apache-2.0 | — | — | Just OAuth2/token plumbing. **This is the right-sized dep** if route 2 is chosen. |
| `ical.js` | 2.2.1 | 2025-08-08 | 977,780 | MPL-2.0 | full RRULE parse/serialize | strong (UID is a first-class property) | Parsing + expansion. Reference iCal impl. |
| `ical-generator` | 11.1.2 | 2026-09-28 | 728,798 | MIT | full RRULE via `rrule` | strong | Generation counterpart to `ical.js`. |
| `rrule` | 2.8.1 | 2023-11-10 | 3,404,920 | BSD-3-Clause | the RRULE engine both of the above use | — | Dormant ~3y but stable; the js-ical.js backbone. |
| `node-ical` | 0.27.2 | 2026-09-13 | 402,514 | Apache-2.0 | yes (expands to occurrences) | yes (exposes `.uid`) | Node-only, actively maintained. |
| `ical-expander` | 3.2.0 | 2025-10-02 | 87,944 | MIT | via ical.js | via node-ical | Thin `VEVENT[] → occurrences[]` layer. |
| `ts-caldav` | 0.4.3 | 2026-09-29 | 1,085 | MIT | yes | yes | Actively maintained but **~1k/wk** — effectively unproven. |
| `dav` | 1.8.0 | **2018-08-11** | 1,996 | MPL-2.0 | via ical.js | yes | **Abandoned 8 years.** Do not adopt. |
| `node-caldav` | 0.0.1 | **2014-06-20** | 1 | MIT | — | — | **Dead.** 1 download/week. Do not adopt. |

**Repo already depends on: none of them.** `package.json:90-115` has no `googleapis`, no `google-auth-library`, no CalDAV client, no iCalendar library. A grep across `src/**/*.ts` and `src/**/*.svelte` for `googleapis|caldav|node-ical|ical.js|ical-generator|from 'rrule'` returns **zero** hits. Everything ICS is hand-rolled.

### What the hand-rolled layer already proves (and what it does not)

| Concern | Status | Evidence |
|---|---|---|
| **UID scheme** | `UID:<eventId>@familyplanz.com`, `ICS_DOMAIN = 'familyplanz.com'` | `src/lib/utils/ics.ts:14`, `ics.ts:109` |
| UID on **import** | **Not captured.** `IcsEventDraft` has no `uid` field at all → inbound UID is discarded, so a round-trip is impossible today | `src/lib/server/services/icsImportService.ts:5-17` |
| **RRULE out** | `FREQ` + `INTERVAL` (omitted when 1) + `BYDAY` + `UNTIL` xor `COUNT`; only daily/weekly/monthly/yearly; other frequencies return `null` | `ics.ts:69-91` (`buildRrule`), `ics.ts:135-136` |
| **RRULE in** | Same five parts. `BYDAY` with an ordinal prefix is stripped, and if any day isn't a plain weekday code the whole `BYDAY` is dropped to `null` rather than mis-filtered | `icsImportService.ts:224-258`, esp. `:238-245` |
| **Missing vs Google** | No `EXDATE`, no `RDATE`, no `BYSETPOS`/`BYMONTHDAY`/`BYMONTH`, no `WKST`, no ordinal `BYDAY` (e.g. "2nd Tuesday") | absence in `ics.ts:69-91` and `icsImportService.ts:224-258` |
| **Time zones** | Always UTC `Z` form; **no `VTIMEZONE`**, no `TZID`. Documented consequence: "recurring wall-times can drift across DST for non-UTC users" | `ics.ts:6-12`, `ics.ts:53-56`; `buildIcsCalendar` emits only `VERSION` + `CALSCALE` (`ics.ts:143-148`); restated as a shipped limitation in `docs/issues/028-ics-add-to-calendar.md:36-40` |
| **Exception Override** | **Malformed as an ICS exception.** A scope-'this' exception is exported as a plain VEVENT reusing the **master's** `id` (hence the master's UID) with `recurrence: null` — no `RECURRENCE-ID`, no `SEQUENCE`. A consumer sees a second event sharing a UID with a different DTSTART | `src/routes/api/events/[id]/ics/+server.ts:64-81`; `ics.ts:105-140` emits no `RECURRENCE-ID` |
| **Deletions** | `STATUS:CANCELLED` VEVENTs are **skipped** on import | `icsImportService.ts:186` |
| **METHOD** | Never emitted. Per RFC 5545 §3.7.2, "If this property is not present in the iCalendar object, then a scheduling transaction MUST NOT be assumed" — which is *correct* for a publish-only feed | absent from `ics.ts:143-148`; <https://www.rfc-editor.org/rfc/rfc5545.html> §3.7.2 |
| **PRODID** | Not emitted (`BEGIN:VCALENDAR` / `VERSION:2.0` / `CALSCALE:GREGORIAN` only). RFC 5545 requires `PRODID` on `VCALENDAR` | `ics.ts:143-148` |
| **Feed scale cap** | `MAX_EVENTS = 500` on import | `icsImportService.ts:19` |
| **No ETag/Last-Modified/Cache-Control** | The ICS route sets only `Content-Type` + `Content-Disposition` | `src/routes/api/events/[id]/ics/+server.ts:84-88` |

**Bottom line:** the writer proves *series* export only, at UTC wall-time, for a 5-part RRULE subset, with no `PRODID`, no `VTIMEZONE`, no `RECURRENCE-ID`, and no cancellation signalling. That is enough for a **one-way, non-recurring-heavy feed today (rung 1)**; it is not enough for a lossless two-way sync without a real iCalendar library.

---

## 6. Fit against this repo's domain

### (a) Recurring Event → Google's master + instances

The models are *structurally compatible*, and unusually so. CONTEXT.md:32-34 defines a **Recurring Event** as one that "regenerates occurrences on a fixed schedule (frequency + interval), **expanded virtually at read time**" — one row, no materialized occurrences. Google's model is one `VEVENT` master (one `id`, one `iCalUID`, one `recurrence[]` array) plus virtual instances; `events.list` without `singleEvents` returns **only masters**, and instances come from `events.instances`.

| | Family Planz | Google |
|---|---|---|
| Storage | 1 row in `events` (`src/lib/server/db/schema.ts:410-456`) | 1 master event resource |
| Schedule | `recurrenceFrequency` / `Interval` / `ByDay` / `Count` / `Until` (`schema.ts:433-440`) | `recurrence[]` RRULE lines |
| Occurrences | computed at read time | computed by API |
| Identity | `id` (15-char) | `id` (per-occurrence) **and** `iCalUID` (shared across occurrences) |

**Map:** push the master with its RRULE; let Google expand. On read, use `events.list` (masters) + `events.instances` per window — do **not** set `singleEvents=true`, which would multiply a daily series into hundreds of rows and burn the 2500-row page cap.

**The one genuine mismatch: Exception Override.** CONTEXT.md:36-38 stores a per-occurrence edit "stored separately without altering the schedule" → `eventExceptions` table keyed by `(eventId, originalDate, isCancelled)` (`schema.ts:458-484`). RFC 5545 §3.8.4.4 `RECURRENCE-ID` is exactly this: "used in conjunction with the 'UID' and 'SEQUENCE' properties to identify a specific instance of a recurring 'VEVENT'… The property value is the original value of the 'DTSTART' property of the recurrence instance." So the mapping is `originalDate` → `RECURRENCE-ID` and `isCancelled` → a cancelled instance. **This repo does not emit `RECURRENCE-ID` today** (`ics.ts:105-140`), so a feed with exceptions is currently wrong in a way Google will silently mis-render. Fixing it is a prerequisite for any sync, not a nice-to-have.

**DST is the second mismatch, and it is already known.** `ics.ts:6-12` and `docs/issues/028-ics-add-to-calendar.md:36-40` both flag that UTC-`Z` recurrence drifts an hour across DST for non-UTC families. A *subscription* feed inherits that drift permanently on the user's phone. A *Calendar API* write would let Google hold the series in the calendar's own `timeZone` and handle DST correctly — i.e. **route 2 fixes a bug that route 1 cannot**.

### (b) Recurring Tasks and Recurring Bills cannot sync to a calendar

They are cursor rows, not schedules, and there is no calendar representation for either.

**Recurring Task** (CONTEXT.md:62-64): "Exactly one live occurrence exists at a time — the cursor. Completing snaps the next one to today + n×interval… **One row per task — no occurrence expansion.**" Schema confirms: `recurrenceFrequency` + `recurrenceInterval` + `completionCount` on a single row (`schema.ts:537-540`).
**Recurring Bill** (CONTEXT.md:66-68): "its dueDate doubles as the cursor… **One row per bill** — spend reports and lists read the cursor due, so a recurring bill appears once per period, never as materialized occurrences." Schema: `dueDate`, `paidAt`, `frequency`, `interval` on one row (`schema.ts:587-596`).

There is no RRULE here. The cursor's next value is a function of *user action* (complete / mark paid) and the anchor, not of a calendar date. Emitting a `VEVENT` would require pre-materialising N future occurrences the domain explicitly forbids, and every advance would require deleting and re-writing them.

Compounding: **Google's CalDAV "doesn't support `VTODO` or `JOURNAL`"** (CalDAV guide), and Google Calendar's JSON API has no task/todo surface either — Tasks are a separate product with a separate API, out of scope. RFC 5545 defines `VTODO` with `DUE`, `STATUS`, `PERCENT-COMPLETE` (§3.6.2) — a natural fit for Recurring Tasks, but **no Google surface accepts it**. Google's own Calendar UI even has a Tasks tab, so this is a genuine Google product boundary, not an implementation gap.

**Only viable shape:** project the *current cursor due date* of a Recurring Task/Bill as a single all-day or timed event, and rewrite it on every advance. That is a projection, not a sync — and it is also exactly the wrong place to put a bill amount, given the privacy posture below. **Recommendation: exclude Tasks and Bills from any Google integration. Sync Events only.**

### (c) Anonymous Account / Claiming

CONTEXT.md:9-11: an **Anonymous Account** is "created silently on first visit, **with no email attached**. Full app access, **no sync**." Claiming (`:13-15`) is "Attaching a verified email to an Anonymous Account, making its data syncable across devices." Schema confirms `email: text('email').unique()` — **nullable, no default** (`schema.ts:25`). An unclaimed account is deleted after the 90-day **Inactivity Window** (`:26-28`), and users are "warned their data cannot sync without Claiming" (`:159`).

| Route | Anonymous Account | Claimed account |
|---|---|---|
| 1 — ICS subscription | **Works.** The feed URL is opaque and self-contained; Google's fetcher needs no Google account and no email on our side. A family could subscribe before Claiming. | Works |
| 2/3/4 — API / CalDAV | **Impossible.** OAuth 2.0 requires the user to authenticate with a Google Account and grant consent. An unclaimed user has no verified identity to consent with, and the app has no email to correlate the grant to. | Works — and this is the natural **Claiming moment**: "connect Google Calendar" is a high-intent action that gives a reason to attach an email. |

This is the strongest argument for the route ladder: **rung 1 works pre-Claiming (matching the existing anonymous-first product design, CONTEXT.md:172-174), rungs 2–4 are post-Claiming-only.** Also note Claim Conflict (CONTEXT.md:21-22, `:158`, `:169-170`) — a Google connection is a per-user credential, so it must ride the user's id and never be merged silently; a Claim Conflict must not carry Google tokens across the merge.

### (d) Privacy posture vs. Receipts

The stance is absolute. CONTEXT.md:146-148: a **Receipt** is "PROCESSED AND DELETED: parsed on-device into text and numbers, **never uploaded or stored**. Only the parsed fields and Line Items persist." `:164` restates it: "A **Receipt** produces **Line Items** and is then discarded — **no image bytes persist anywhere**." The **OCR Chain** (`:150-152`) is on-device-first by design: "Chrome Prompt API (on-device) → native bridge… → tesseract.js → **opt-in** Azure Document Intelligence (cloud, per-scan consent, only when server-configured)."

Where a Google sync would sit:

1. **The receipt *images* are already never on our server, so there is nothing for Google to receive.** A Calendar sync touches Events only. Stated positively: a Google integration does not weaken the Receipt stance, because no Receipt byte exists server-side to leak.
2. **But the posture is the argument for scope-narrowing.** The repo has already proven it will refuse a cloud path for the most sensitive data. Broadcasting family events (kids' schedules, school, medical appointments, location) to a third-party SaaS is a different class of data from a receipt photo, and the honest position is: receipts stay local, events may leave — **only after Claiming, only with the narrowest scope, only on explicit per-user action.**
3. **The ICS feed route is the privacy-respecting one — with a caveat.** A tokenised feed is a *pull*: the user hands Google a URL, and Google caches a copy. It is not a continuous upload of the whole database, and the feed is revocable by rotating the token (though Google's un-sharing propagation took "up to 4 hours" when *it* did it, 37083 — so rotation is the only real lever, and Google may hold a stale cached copy for a while).
4. **Hard rules for any route:** never include Receipt-derived **Line Items** or spend detail in a Google description; never include **Private Tasks** (CONTEXT.md:50) in a family feed; treat the feed token as a credential — rotate on Claim, on family membership change, and on user request.

---

## 7. Cost, limits, and verification

**Is the Calendar API free?** "All standard use of the Google Calendar API is available at **no additional cost**." Quota guide: <https://developers.google.com/workspace/calendar/api/guides/quota>. No paid tier is required. CalDAV shares the same free quota and the same limits (CalDAV guide). Route 1 costs nothing at all — no API, no quota, no project.

**Quotas, as documented (page updated for the 2026-05-01 change):** see the table in §2. Two notes:
- "Google Cloud projects that made any use of this API between November 2025 and April 2026 will continue with their previously set usage quotas. Cloud projects created **on or after May 1, 2026** are subject to the new API quotas." → a brand-new project gets 10,000/min-project, 600/min/user.
- "Exceeding the quota request limits is planned to incur charges to your Google Cloud billing account later in 2026… Full billing details will be shared later in 2026 with at least 90 days' notice." → 1,000,000 req/day/project free; the daily threshold **cannot** be raised.
- This is a per-**project** and per-**user** budget, not a per-calendar one. For a self-hosted family app the 600/min/user bucket is enormous; the risk is a runaway retry loop, not legitimate traffic.

**Verification requirement — this is the real cost of rungs 2–4.** Every Calendar scope is classified **sensitive**:
- Google's sensitive-scope page gives the canonical example: "Examples of sensitive scopes include **reading events stored in Google Calendar**, storing a new contact in Google Contacts, or deleting a YouTube video." <https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification>
- Classification is surfaced per-scope in the Cloud Console's Data Access page: "Added scopes are classified as non-sensitive, sensitive, or restricted" (auth/consent guide: <https://developers.google.com/workspace/calendar/api/guides/auth>).
- Requirements matrix (same auth guide): **Non-sensitive** = basic app verification only. **Sensitive** = basic + **additional app verification**. **Restricted** = basic + additional + **annual third-party security assessment**.

So `calendar.events.readonly` / `calendar.events` are **sensitive** → basic **and** additional app verification, plus a **demonstration video**:
> "Prepare a video that fully demonstrates how a user initiates and grants access to the requested scopes and shows, in detail, the usage of the granted sensitive and restricted scopes in the app. Upload the video to YouTube Studio and set its Visibility as Unlisted."

Plus the compliance obligations (<https://support.google.com/cloud/answer/13464321>): app-type eligibility, data-use limited to "user-facing features that are prominent in the requesting app's user interface", no ad-platform/data-broker transfer, and "**Humans are not allowed to read the data**" absent explicit per-item user agreement. And brand verification first: "you must have a published branding status before you can request verification for data access" (sensitive-scope-verification).

Escape hatches, from the same pages: "Exceptions to verification requirements include **personal use, development/testing/staging environments**, service-owned data only, internal use within an organization, and domain-wide installation." → the app can ship to `test.familyplanz.com` and to a bounded pilot as a Testing-status OAuth app (test users only, "This app isn't verified" warning, per <https://developers.google.com/workspace/calendar/api/troubleshoot-authentication-authorization>), and only the public launch is gated.

**Is `calendar` (the full scope) restricted?** No — the full `calendar` scope is sensitive, not restricted. Restricted scopes (which trigger the annual security assessment) are things like Drive full-file, Gmail full, and broad Contacts scopes. Verifying that Calendar scopes are not on the restricted list from a Google primary source: the classification lives in the Cloud Console Data Access UI and the OAuth verification FAQ rather than a public table, so the **"sensitive, not restricted"** classification is **UNVERIFIED against an authoritative public list** — the sensitive-scope-verification page's explicit Google-Calendar example is the strongest public evidence and it names reading calendar events as *sensitive*.

---

## Tagged backlog

- `[calendar-sync][privacy]` Rung 1: `GET /feed/[token].ics` — anonymous, tokenised, family-scoped; add `PRODID`, `METHOD` (omit, per RFC 5545 §3.7.2), `Cache-Control: no-cache`
- `[calendar-sync][recurring-events]` Emit `RECURRENCE-ID` + `SEQUENCE` for Exception Override; emit `STATUS:CANCELLED` for cancelled occurrences — **required** before any exception-bearing feed is correct
- `[calendar-sync][recurring-events]` Stop exporting recurrence as fixed UTC wall-time; add `VTIMEZONE` + `TZID` so series don't drift across DST (`ics.ts:6-12` open limitation)
- `[calendar-sync][tasks]` Surface the trade explicitly in copy: Recurring Tasks/Bills are cursor rows and will not sync
- `[calendar-sync][onboarding][retention]` Use "connect Google Calendar" as a Claiming moment (post-Claiming only)
- `[calendar-sync][onboarding][retention]` Let a family subscribe the feed **pre-Claiming** (no Google account needed) — the only rung that works for Anonymous Accounts
- `[calendar-sync][privacy]` Rotate the feed token on Claim / family-membership change / user request; never emit Private Tasks or Line Items
- `[calendar-sync][stats]` `freebusyQuery` for a "who's actually free" layer — cheapest Google-backed read (max 50 calendars per call)
- `[calendar-sync][recurring-events]` If rungs 2–4 are ever taken: use `events.list` masters + `events.instances`, never `singleEvents=true`; join on `iCalUID`, never `id`

## Assumptions (flag for correction)

- Repo is on the Vercel **Hobby** plan → 1 cron/day. If Pro, rung 3's polling fallback becomes materially cheaper.
- Family Planz targets **consumer @gmail** users, not Workspace tenants (Workspace admins can block third-party OAuth apps outright).
- "Google sync" means *Events only*; Tasks/Bills excluded per §6(b).
