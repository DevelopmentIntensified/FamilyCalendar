# Research: Outlook / Microsoft 365 calendar sync

Checked 2026-09-30. Every claim cited to a primary source (Microsoft Learn / support.microsoft.com / RFCs / npm registry / repo files). Anything I could not confirm from a primary source is tagged **UNVERIFIED**.

## Verdict

Outlook sync is possible, but only in one direction that costs almost nothing. The cheapest route is a **read-only remote ICS feed** — host a `text/calendar` URL from the app, tell the user to add it via *Outlook on the web → Add calendar → Subscribe from web*, and Exchange fetches it server-side roughly every 3–4 hours and fans it out to desktop, web and mobile. That is a **S** slice (one new public endpoint reusing `src/lib/utils/ics.ts`), no OAuth, no consent screen, no token storage, no app registration. Everything past that rung is **not** a family app: Graph read-only import is **M** (Entra app registration + OAuth + refresh-token storage + delta sync + the Anonymous-Account/Claiming gate); Graph two-way write is **L** (change notifications on `event` expire at **10,080 minutes / under 7 days**, not 3 days, need a publicly-reachable HTTPS endpoint that echoes a `validationToken` within 10s, and must be renewed forever — and Vercel Hobby crons run **once per day at best**, so renewal cannot be scheduled on the cheapest plan); CalDAV is a **dead end** — Exchange Online exposes no server-side CalDAV endpoint at all. Top 3 blockers: (1) the Microsoft-managed default tenant consent policy **explicitly excludes `Calendars.Read`/`ReadBasic`/`ReadWrite`** from end-user consent and is the default for new tenants, so any work/school Microsoft 365 user needs an admin; (2) the `event` webhook subscription lifetime is under 7 days and must be renewed, which does not fit a daily cron; (3) an **unclaimed Anonymous Account has no email** (CONTEXT.md:9-14), so there is no identity to run a consent flow against — Graph sync structurally only exists post-Claiming.

---

## Route ladder

| # | Route | Direction | Effort | Verdict |
|---|---|---|---|---|
| 1 | Remote ICS subscription | app → Outlook, read-only | **S** | Works. Recommended. |
| 2 | Graph read-only (`calendarView` + `delta`) | Outlook → app | **M** | Works, admin-consent gated |
| 3 | Graph write + change notifications | both ways | **L** | Works, operationally awkward on Vercel Hobby |
| 4 | CalDAV | both ways | — | **Dead end — no server-side endpoint** |
| 5 | Helper libs | infra | S–M | Nothing to install for route 1; small adds for 2/3 |

---

## 1. Remote ICS subscription (read-only feed) — effort S

### The load-bearing fact, corrected

My prior belief ("Exchange/Microsoft 365 mailboxes cannot subscribe to an external URL") is **wrong**, and it matters. Microsoft documents the external-URL subscription path on **every** first-party client:

| Client | External `.ics` URL subscription | Primary source |
|---|---|---|
| Outlook for Windows (classic) | Yes — *Manage Calendars → Open Calendar → From Internet* | [KB 4025591 / "Can't add an Internet calendar"](https://learn.microsoft.com/en-us/troubleshoot/outlook/calendaring/cannot-add-an-internet-calendar) |
| New Outlook for Windows | Yes — *Add Calendar → Subscribe from web → Import* | same KB |
| Outlook on the web / Outlook.com | Yes — *Add calendar → Subscribe from web → Import* | [Import or subscribe to a calendar in Outlook.com or Outlook on the web](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web) |
| Outlook for Mac | Yes, classic — *Open Calendar → From Internet*; new Mac Outlook is OWA-equivalent. **No first-party support article found for new Mac** → UNVERIFIED | [Q&A: How do I add an Internet calendar to Outlook for Mac?](https://learn.microsoft.com/en-us/answers/questions/4561910/how-do-i-add-an-internet-calendar-to-outlook-for) (community answer) |
| Outlook iOS / Android | **No documented ICS-URL entry.** Documented options are *Add Shared Calendar* (search a person/room/mailbox in your org) only. → UNVERIFIED whether a raw URL is accepted | [How do I open a shared calendar?](https://support.microsoft.com/en-us/outlook/how-do-i-open-a-shared-calendar) |

**The mobile gap has a documented workaround.** If the subscription is created on Outlook on the web, the *server* takes ownership of it, and it then appears on every client including mobile:

> "When you add an Internet calendar by using Outlook on the web, the server that's running Exchange Server manages the calendar subscription and updates… The calendar that's added from Outlook on the web doesn't appear in the Outlook desktop application as an Internet calendar. Instead, it's displayed as a calendar entry in the **Other Calendars** group." — [KB 4025591](https://learn.microsoft.com/en-us/troubleshoot/outlook/calendaring/cannot-add-an-internet-calendar)

So the onboarding copy must say **"add it on Outlook on the web first"**, then the user's phone picks it up. This is the single most important UX detail in route 1.

### Refresh cadence (documented, and the docs disagree)

| Source | Number | Citation |
|---|---|---|
| Internet-calendar KB | "sync approximately every **four hours**" | [KB 4025591](https://learn.microsoft.com/en-us/troubleshoot/outlook/calendaring/cannot-add-an-internet-calendar) |
| Outlook.com subscribe help | "can sometimes take more than **24 hours**"… "updates should happen approximately every **3 hours**" | [Import or subscribe…](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web) |
| Calendar-sharing (ICS recipient table) | "If the recipient is in Outlook.com, the calendar will update approximately every **three hours**" | [Calendar sharing in Microsoft 365](https://support.microsoft.com/en-us/office/calendar-sharing-in-microsoft-365-b576ecc3-0945-4d75-85f1-5efafb8a37b4) |

Read as a **3–4 hour** refresh, worst case >24h. A family-calendar feed is therefore *not* a same-day-trip-planning source. Say so in the UI. Read-only is also Microsoft-stated, not inferred: "ICS calendars are read-only, so even if you grant edit access to other people, they won't be able to edit your calendar." — [Share your calendar in Outlook on the web](https://support.microsoft.com/en-us/outlook/share-your-calendar-in-outlook-on-the-web)

### `webcal://` vs `https`

- Serve **plain `https://…/family.ics`**. Microsoft's own guidance: "In the Internet calendar box enter the URL, and select **Open**. The URL probably ends with the `.ics` file extension." and the troubleshooting hint is "try removing the calendar and adding it again, **changing the protocol from http to https**" — [Share your calendar in Outlook on the web](https://support.microsoft.com/en-us/outlook/share-your-calendar-in-outlook-on-the-web)
- `webcal://` is an Apple convention. IANA lists `webcal` as a **Provisional** URI scheme (ref 4183, a draft — no RFC). [IANA URI Schemes registry](https://www.iana.org/assignments/uri-schemes/uri-schemes.xhtml). It appears nowhere in RFC 5545 ([rfc5545](https://www.rfc-editor.org/rfc/rfc5545)) and nowhere in Microsoft's subscribe docs. Treat Outlook `webcal://` support as UNVERIFIED → just use `https`.

### "Publish a calendar → Share with web URL" is the *reverse* direction

That feature publishes **Microsoft's** calendar, it does not accept an external URL:

> "You can share your Outlook calendar with others by publishing it from Outlook on the web… **Published calendars are viewable by anyone with the link to the calendar.**" — [Introduction to publishing Internet Calendars](https://support.microsoft.com/en-us/outlook/introduction-to-publishing-internet-calendars)

Same doc, "If you choose an ICS link, recipients can download the ICS file and import it into Outlook. This will add your events into their calendar, but recipients won't automatically receive any updates… Alternatively, recipients can use the ICS link to **subscribe**" — [Share your calendar in Outlook on the web](https://support.microsoft.com/en-us/outlook/share-your-calendar-in-outlook-on-the-web). Microsoft uses exactly this ICS-subscription mechanism when sharing a M365 calendar with Gmail or a third-party service — [Calendar sharing in Microsoft 365](https://support.microsoft.com/en-us/office/calendar-sharing-in-microsoft-365-b576ecc3-0945-4d75-85f1-5efafb8a37b4). So Microsoft itself treats ICS-subscription as the interoperability path. Good precedent.

### Is the subscription URL a secret?

Yes — treat it as a **bearer token**. Microsoft's published-calendar semantics are "viewable by **anyone with the link**" ([Introduction to publishing Internet Calendars](https://support.microsoft.com/en-us/outlook/introduction-to-publishing-internet-calendars)). So must ours be: an unguessable per-family path, no enumeration, revocable. Note that `TEXT/CALENDAR` feeds have no auth, so revocation = rotate the path.

### Route-1 build checklist for this repo

- New route, family-scoped, e.g. `GET /api/family/[familyId]/calendar.ics`.
- **Must not** clone the existing auth pattern: `src/routes/api/events/[id]/ics/+server.ts:23` returns 401 without `locals.user`, and `:87` sets `Content-Disposition: attachment` — that is a per-event download, not a subscription feed. A feed must be anonymous-with-secret-path + `Content-Type: text/calendar` + no attachment disposition.
- Reuse `buildIcsCalendar`/`buildIcsEvent` (`src/lib/utils/ics.ts:143`, `:105`) as-is.
- `UID` already stable: `${event.id}@familyplanz.com` (`src/lib/utils/ics.ts:14`, `:109`) — satisfies RFC 5545 §3.8.4.7 "MUST be a globally unique identifier" ([rfc5545 §3.8.4.7](https://www.rfc-editor.org/rfc/rfc5545#section-3.8.4.7)).
- `RRULE` already emitted for series (`src/lib/utils/ics.ts:69-91`, `:136`): FREQ daily|weekly|monthly|yearly, INTERVAL, BYDAY, UNTIL-or-COUNT.
- Known gap: `buildIcsCalendar` (`src/lib/utils/ics.ts:143-148`) emits no `PRODID`, no `METHOD:PUBLISH`, no `SEQUENCE`, no `VTIMEZONE`, no `EXDATE`. All optional under RFC 5545; Outlook tolerates them (it consumes such feeds as documented above). All instants are exported as UTC (`src/lib/utils/ics.ts:6-12`).

---

## 2. Microsoft Graph read-only (import into the app) — effort M

### App registration
- Entra app registration, authorization-code flow. Single-tenant would mean one registration per family — untenable; needs **multi-tenant**. Publisher verification is a precondition for enterprise adoption but not for basic consent ([Publisher verification overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)).
- Multi-tenant + `Calendars.ReadWrite` + not-publisher-verified + risk-based step-up consent enabled ⇒ **users cannot consent**: "if risk-based step-up consent is enabled, users can't consent to most newly registered multitenant apps that aren't publisher verified" — [Publisher verification overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview).

### Permissions
| Permission | Grants | Admin consent (app perm) | Personal MS account |
|---|---|---|---|
| `Calendars.ReadBasic` | "read events in user calendars, **except for properties such as body, attachments, and extensions**" | No | Yes |
| `Calendars.Read` | read events | Yes (application) | Yes |
| `Calendars.ReadWrite` | "**Have full access to user calendars**… create, read, update, and delete events" | Yes (application) | Yes |

— [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference). `Calendars.ReadBasic` is the least-privileged choice for `/me/calendars` ([List calendars](https://learn.microsoft.com/en-us/graph/api/user-list-calendars)) and for `getSchedule` ([calendar: getSchedule](https://learn.microsoft.com/en-us/graph/api/calendar-getschedule)). Caveat, community-reported: `getSchedule` may actually require `Calendars.Read` ([Q&A 5509299](https://learn.microsoft.com/en-us/answers/questions/5509299/)) — UNVERIFIED, test before shipping.

### `offline_access` + refresh tokens
- `offline_access` is the OIDC scope that returns a refresh token — [Microsoft identity platform OIDC scopes](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc).
- Default refresh-token lifetime: **90 days** for "all other scenarios" (24h for SPAs, 24h for email-OTP flows). Tokens **replace themselves on every use** (sliding), and old ones are not revoked. **Any refresh token under 45 minutes' requested expiry is auto-bumped to 45 minutes** ([subscription resource](https://learn.microsoft.com/en-us/graph/api/resources/subscription) — same rule applies to token requests).
- Revocation is real and out of your hands: password reset/change, user revocation, admin revocation, and Conditional Access / Continuous Access Evaluation can kill it early. Table: [Refresh tokens in the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens).
- ⇒ Operationally you must build a **re-auth prompt** path. There is no silent long-term token.

### Endpoints, paging, headers
- `GET /me/calendars` → calendar list ([List calendars](https://learn.microsoft.com/en-us/graph/api/user-list-calendars)).
- `GET /me/calendarView?startDateTime=…&endDateTime=…` → occurrences + exceptions + instances in a window, recurrences expanded by the service ([List calendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview)).
- **`$top` max = 1000**; no documented max *date* window — you page. "CalendarView with `$top` has a minimum value of 1 and maximum of 1000." ([List calendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview)). Same page: `createdDateTime` / `lastModifiedDateTime` **do not support `$select`** — drop `$select` if you need them.
- Paging: default 100 per page, follow `@odata.nextLink` until absent ([Paging in Microsoft Graph](https://learn.microsoft.com/en-us/graph/paging)). `Prefer: odata.maxpagesize={x}` tunes it ([Get incremental changes to events in a calendar view](https://learn.microsoft.com/en-us/graph/delta-query-events)).
- **`Prefer: outlook.timezone="<Windows tz name>"`** rewrites start/end in the response; **omitted ⇒ UTC**. `OriginalStartTimeZone` / `OriginalEndTimeZone` carry the creation zone ([List events](https://learn.microsoft.com/en-us/graph/api/user-list-events), [Get event](https://learn.microsoft.com/en-us/graph/api/event-get)). Note the repo already has an Outlook-TZ-name→IANA map (`src/lib/server/services/icsImportService.ts:88-97`), so this seam is half-solved.
- Prefer also exists for immutable ids: `Prefer: IdType="ImmutableId"` keeps ids from changing when an item moves between containers ([event resource](https://learn.microsoft.com/en-us/graph/api/resources/event)). Use it for a durable external mapping.

### `$select` / `$expand` / attendees — premise correction
The "attendees are not returned by default" rule is **not** a Microsoft Graph behaviour. Graph lists `attendees` as a plain property — "The collection of attendees for the event" — returned unless you `$select` it away ([event resource](https://learn.microsoft.com/en-us/graph/api/resources/event)); Graph's own sample does `$select=subject,body,bodyPreview,organizer,attendees,start,end,location` ([List events](https://learn.microsoft.com/en-us/graph/api/user-list-events)). The rule you are remembering is from **EWS / the legacy Outlook Calendar REST API**. Practical consequence inverted: use `$select` **including** `attendees` or you will silently lose the family-member mapping. `$expand` is **not** among the documented optional query parameters for these endpoints — UNVERIFIED as explicitly prohibited, treat as unsupported.

### `delta` for incremental sync
- Endpoint `GET /me/calendarView/delta?startDateTime=…&endDateTime=…` ([event: delta](https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0), [Get incremental changes to events in a calendar view](https://learn.microsoft.com/en-us/graph/delta-query-events)).
- Lifecycle: loop `@odata.nextLink` (`$skiptoken`) until the response carries `@odata.deltaLink` (`$deltatoken`); save the whole deltaLink URL and re-issue it next round. One round per calendar view — "To track the changes in multiple calendars, you need to track each calendar individually" ([delta-query-events](https://learn.microsoft.com/en-us/graph/delta-query-events)).
- **`$select` is not supported** in a calendar-view delta ([delta-query-events](https://learn.microsoft.com/en-us/graph/delta-query-events)); the event delta also excludes `$expand`, `$filter`, `$orderby`, `$search` ([event: delta (beta doc, restriction list)](https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-beta)). So you cannot trim a delta payload. Budget for that.
- **410 reset cost**: "Delta query can return a response code of **410 Gone** and a Location header containing a request URL with an empty `$deltatoken`… This status usually happens to prevent data inconsistency due to internal maintenance or migration of the target tenant, and is an indication that the application must restart with a **full synchronization**" ([delta-query-overview](https://learn.microsoft.com/en-us/graph/delta-query-overview)). Token validity: "For Outlook entities (`message`, `mailFolder`, **`event`**, `contact`, `contactFolder`, `todoTask`, and `todoTaskList`), the **upper limit isn't fixed**; it's dependent on the size of the internal delta token cache" ([delta-query-overview](https://learn.microsoft.com/en-us/graph/delta-query-overview)). ⇒ Design the full-resync path as a first-class routine, not an error branch. Full resync of a family calendar is cheap (single mailbox, calendarView paging), so this is survivable.
- Delta returns replays: "Your application must be prepared for replays… While delta query makes a best effort to reduce replays, they're still possible" ([delta-query-overview](https://learn.microsoft.com/en-us/graph/delta-query-overview)). Idempotent upsert required.

### `changeKey`
> "Identifies the version of the event object. **Every time the event is changed, ChangeKey changes as well.** It allows Exchange to apply changes to the correct version of the object." — [event resource](https://learn.microsoft.com/en-us/graph/api/resources/event)

This is the optimistic-concurrency token for writes (`If-Match`). Store it per event; it is the cheapest conflict detector available and matches the repo's existing offline replay model (`src/lib/utils/offline.ts:26`).

---

## 3. Graph two-way write + change notifications — effort L

### Write surface
`Calendars.ReadWrite` gives create/update/delete on events ([permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)). Writes also expose `transactionId` for idempotency ([event resource](https://learn.microsoft.com/en-us/graph/api/resources/event)) — use it; a retried POST after a 429 must not create a duplicate.

### Recurring master + instances
| Property | Meaning | Citation |
|---|---|---|
| `seriesMasterId` | "The ID for the recurring series master item, if this event is part of a recurring series" | [event resource](https://learn.microsoft.com/en-us/graph/api/resources/event) |
| `iCalUId` | "A unique identifier for an event across calendars. **This ID is different for each occurrence in a recurring series.** Read-only." | same |
| `type` | `occurrence` / `exception` / `seriesMaster` | same |
| `changeKey` | version token, changes on every edit | same |

Two consequences, both load-bearing:
1. **Graph's stable per-series identifier is `seriesMasterId`, not `iCalUId`** — `iCalUId` is per-occurrence and read-only, so it cannot be used to write back. The repo's `UID` scheme (`ics.ts:109`) is the *import-side* identity only.
2. **The repo's model is a genuine structural mismatch** — see §6.

### Webhooks (`subscriptions` resource)
| Fact | Value | Citation |
|---|---|---|
| Max lifetime, Outlook `message`/`event`/`contact` | **10,080 minutes (under 7 days)** — *not* 3 days | [subscription resource](https://learn.microsoft.com/en-us/graph/api/resources/subscription) |
| Max lifetime, rich notifications (`includeResourceData`) | **1,440 minutes (under 1 day)** | same |
| `expirationDateTime` floor | under 45 min → auto-bumped to 45 min | same |
| `notificationUrl` | "This URL **must make use of the HTTPS protocol**" | [Update subscription](https://learn.microsoft.com/en-us/graph/api/subscription-update) |
| Endpoint reachability | must be publicly reachable HTTPS; Graph POSTs to it | [Webhook delivery](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks) |
| `clientState` | "Optional. Specifies the value… **maximum length is 128 characters**. The client can check that the change notification came from the service by comparing…" | [subscription resource](https://learn.microsoft.com/en-us/graph/api/resources/subscription) |
| Notification types | Basic (id only) / Rich (resource data) / **Lifecycle** (tells you you're about to miss notifications) | [Change notifications overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview) |
| Calendar latency | average < 1 minute, max 3 minutes | same |

**Validation handshake** — Graph encodes an opaque token and POSTs it as a query param; you must answer within 10 seconds:
> `POST https://{notificationUrl}?validationToken={opaqueTokenCreatedByMicrosoftGraph}` … "The client must respond with… A status code of **HTTP 200 OK**. A content type of **text/plain**. A body that includes the URL decoded plain text validation token." … "Escaping any HTML or JavaScript is a good practice because malicious actors can use the notification endpoint for cross-site scripting type of attacks… treat the validation token value as opaque" — [Webhook delivery](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)

⇒ The handler must **echo attacker-influenced input into a `text/plain` response** without HTML-escaping bugs. That is exactly the kind of thing the repo's security stance should get a test for.

### Operational meaning of subscription expiry — the Vercel verdict

Subscriptions must be renewed or silently lost; "Apps need to renew their subscriptions before the expiration time; otherwise, they need to create a new subscription" ([subscription resource](https://learn.microsoft.com/en-us/graph/api/resources/subscription)). With a 7-day ceiling:

| Vercel plan | Cron granularity | Verdict |
|---|---|---|
| **Hobby** | "100 cron jobs … **Once per day**", precision "Per-hour (±59 min)" | Cannot renew a 7-day subscription reliably. A single miss = webhook gap. |
| Pro / Enterprise | 100 cron jobs, "**Once per minute**", per-minute precision | Fine. |

— [Vercel Cron Jobs — Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing). Hobby also *rejects deployment* for sub-daily expressions, so this is not a runtime limit you can dodge. The repo's existing cron is weekly (`vercel.json` → `"0 4 * * 1"`, cleanup only).

**Plain statement: two-way Graph write with webhooks is not feasible on Vercel serverless at Hobby.** Two workable shapes:
- (a) **Delta polling, no webhooks.** Poll `calendarView/delta` on a Pro cron (or opportunistically on user request). Latency = cron period. This is the right answer for a family app — near-real-time push is not a requirement anyone actually has here.
- (b) Webhooks + renewal, requires Vercel Pro **and** per-mailbox subscription bookkeeping **and** a lifecycle-notification endpoint, to notice expiries you slept through.

### Throttling — the per-mailbox numbers are the ones that matter
Global: **130,000 requests per 10 seconds** per app across all tenants ([Service-specific throttling limits](https://learn.microsoft.com/en-us/graph/throttling-limits)). Outlook service, **per app-ID-and-mailbox combination**:

| Limit | Applies to | Scope |
|---|---|---|
| **10,000 API requests in a 10-minute period** | v1.0 and beta endpoints | per app + mailbox |
| **Four concurrent requests** | v1.0 and beta endpoints | per app + mailbox |
| 150 MB upload (PATCH/POST/PUT) in a 5-minute period | v1.0 and beta | per app + mailbox |

— [Service-specific throttling limits](https://learn.microsoft.com/en-us/graph/throttling-limits), "The Outlook service applies limits to each app ID and mailbox combination… Exceeding the limit for one mailbox doesn't affect the ability of the application to access another mailbox."

That is **~16 req/s per mailbox sustained** and only **4 in flight**. For a family app (one mailbox per member, a few hundred events) this is enormous headroom. Reads can be throttled while writes pass, and limits are per request *type* — [Throttling guidance](https://learn.microsoft.com/en-us/graph/throttling).

Handling is mandatory: on `429`, read `Retry-After` (seconds) and wait exactly that long, retry; **do not** implement immediate retries, "because all requests accrue against your usage limits"; if no `Retry-After` is present, fall back to exponential backoff — [Throttling guidance](https://learn.microsoft.com/en-us/graph/throttling). Note the exception: some resource families return 429 *without* `Retry-After` (e.g. identity device operations) — [throttling-limits](https://learn.microsoft.com/en-us/graph/throttling-limits).

---

## 4. CalDAV against Exchange Online — **DEAD END**

**Microsoft exposes no server-side CalDAV endpoint for Exchange Online. There is nothing for a third-party server to write to.** Stated loudly because it is the fact that removes an entire rung from the ladder.

Evidence:
1. **The protocol index has no CalDAV.** [Clients and mobile in Exchange Online](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/clients-and-mobile-in-exchange-online) enumerates Outlook desktop, **Exchange ActiveSync**, **POP3/IMAP4**, Outlook on the web, MailTips, add-ins, Basic auth, modern auth. No CalDAV. No CardDAV.
2. **The paid service description has no CalDAV.** The Exchange Online service description enumerates "Outlook on the web", "Outlook for iOS and Android", "Exchange ActiveSync and SMTP", "POP and IMAP", "EWS application support" — the string "CalDAV" does not appear ([Exchange Online service description](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-service-description)).
3. **Discovery would be impossible anyway.** CalDAV discovery is DNS SRV — "_caldav: Identifies a CalDAV server that uses HTTP without TLS. _caldavs: Identifies a CalDAV server that uses HTTP with TLS" ([RFC 6764 §3](https://www.rfc-editor.org/rfc/rfc6764#section-3)). No such record is published for `*.outlook.com` / `*.onmicrosoft.com` domains. (Absence-of-record claim, verified by inspection not by an authoritative Microsoft statement — treat the *conclusion* as documented by 1+2 and the SRV point as corroboration.)
4. **Microsoft routes third-party calendar integration to Graph, and is actively killing the legacy alternative.** "We recommend that you migrate your EWS apps that access Exchange Online to Microsoft Graph" ([Migrate EWS apps to Microsoft Graph](https://learn.microsoft.com/en-us/graph/migrate-exchange-web-services-overview)); EWS is being disabled from **1 Oct 2026** and permanently removed **1 Apr 2027** ([Deprecation of EWS in Exchange Online](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-ews-exchange-online)).

### Client-side CalDAV (the part that exists)
- Outlook **desktop/Mac do not document arbitrary CalDAV server support.** MS support articles cover ICS subscriptions, Exchange shared calendars, IMAP — not CalDAV. Corroborated by a Microsoft employee on Q&A: when Outlook gained Gmail/iCloud calendars, "they didn't use the caldav — they set up a microsoft cloud solution that uses exchange server" ([Q&A 4525673](https://learn.microsoft.com/en-us/answers/questions/4525673/caldav-support-on-outlook-com)) — community-tier citation, corroborating only.
- Outlook **mobile/new-Outlook** ingest **named third-party providers only**: "This is available for Gmail, Yahoo, iCloud, and IMAP accounts in Outlook for iOS, Outlook for Android, and new Outlook for Mac" — and it does so by copying the mailbox into Microsoft datacentres, not by pointing the client at your server ([Sync your account in Outlook to the Microsoft Cloud](https://support.microsoft.com/en-us/outlook/getstarted/sync-your-account-in-outlook-to-the-microsoft-cloud)). Same doc: "a copy of your email, calendar, and contacts will be synchronized between your email provider and Microsoft data centers."
- ⇒ Even the client story routes through Microsoft, not through your server.

**Conclusion for route 4: CalDAV cannot be the outbound-sync mechanism for Microsoft. Drop the rung.**

---

## 5. Server-side helper libraries

All figures from the npm registry metadata + downloads API, checked 2026-09-30.

### Microsoft / Graph
| Package | Latest | Published | Weekly dl | License | Notes |
|---|---|---|---|---|---|
| `@microsoft/microsoft-graph-client` | 3.0.7 | 2023-09-19 | 2,699,759 | MIT | **Stale** — no release in ~3 yrs. Deps only `tslib`, `@babel/runtime`. Zero polyfills → **you must supply `fetch` yourself** on old Node. Consider `@microsoft/microsoft-graph-client-javascript` Kiota lineage instead — UNVERIFIED, not checked. |
| `@azure/identity` | 4.13.3 | 2026-09-14 | 18,457,639 | MIT | Actively released. Pulls `@azure/msal-node`. Heavy for a flow this simple. |
| `node-fetch` | 3.3.2 | 2023-07-25 | 234,763,027 | MIT | **Unnecessary** — this app runs Node 22+ where global `fetch` exists. |
| `isomorphic-fetch` | 3.0.0 | 2020-09-23 | 12,568,882 | MIT | Dead; wraps `node-fetch` + `whatwg-fetch`. Do not add. |

Sources: [registry.npmjs.org/<pkg>](https://registry.npmjs.org/), [api.npmjs.org/downloads/point/last-week/<pkg>](https://api.npmjs.org/downloads/point/last-week/).

### iCalendar
| Package | Latest | Published | Weekly dl | License | RRULE / UID round-trip |
|---|---|---|---|---|---|
| `ical.js` | 2.2.1 | 2025-08-08 | 977,780 | **MPL-2.0** | Full RFC 5545 parse/serialize incl. RRULE + UID. Watch licence: MPL-2.0 is file-level copyleft. |
| `ical-generator` | 11.1.2 | 2026-09-28 | 728,798 | MIT | Generates; `rrule` is a **peer dep**. |
| `rrule` | 2.8.1 | 2023-11-10 | 3,404,920 | BSD-3-Clause | RRULE parse/serialise only. No UID concept. |
| `node-ical` | 0.27.2 | 2026-09-13 | 402,514 | Apache-2.0 | Parse-only. Now on `rrule-temporal` + `temporal-polyfill`. |

Sources: [npm registry](https://registry.npmjs.org/). RRULE/UID support is from the package descriptions/READMEs; round-trip fidelity beyond that is **UNVERIFIED** (not tested here).

### CalDAV
| Package | Latest | Published | Weekly dl | License | Verdict |
|---|---|---|---|---|---|
| `ts-caldav` | 0.4.3 | 2026-09-29 | 1,085 | MIT | Actively maintained. Deps `ical.js`, `fast-xml-parser`, `uuid`. **Only relevant if we ever became a CalDAV *server*.** |
| `node-caldav` | 0.0.1 | 2014-06-20 | **1** | MIT | Abandoned; dep on native `libxmljs`. Ignore. |
| `dav` | 1.8.0 | 2018-08-11 | **1,996** | MPL-2.0 | Effectively unmaintained. Ignore. |

Sources: [npm registry](https://registry.npmjs.org/).

### What the repo already has
- `package.json:90-115` — dependencies contain **no** `@microsoft/*`, **no** `ical.*`, **no** `rrule`, **no** CalDAV client. Confirmed by grep across `src/`.
- Hand-rolled ICS writer: `src/lib/utils/ics.ts` — `ICS_DOMAIN = 'familyplanz.com'` (`:14`), `UID:${input.id}@${ICS_DOMAIN}` (`:109`), `buildRrule` (`:69-91`), `RRULE:` emission (`:136`), CRLF VCALENDAR wrapper (`:143-148`), Google render-URL builder (`:170-196`).
- Hand-rolled ICS parser: `src/lib/server/services/icsImportService.ts` — `MAX_EVENTS = 500` (`:19`), Outlook pseudo-TZID→IANA map (`:88-97`), `FREQ_MAP` (`:137-142`), RRULE parse incl. BYDAY ordinal stripping (`:224-258`), UNTIL both datetime and date-only forms (`:110-120`).
- **Proven round-trip is one-directional only.** `IcsEventDraft` (`icsImportService.ts:5-17`) has **no UID field** and `buildDraft` never reads `UID` — import is UID-blind, so an ICS→app→ICS round trip mints a new identity every pass. RRULE survives (`buildRrule` is the documented inverse of the parser, `ics.ts:64-68`); **UID does not.**
- Only export endpoint is per-event + authenticated + `attachment` disposition (`src/routes/api/events/[id]/ics/+server.ts:23`, `:83-88`) — **no family feed exists today**.
- Precedent for a webhook receiver already in-tree: `web-push` + VAPID (`src/lib/server/services/pushService.ts:4`, `src/lib/server/db/schema.ts:962` subscription table, `src/routes/api/push/subscribe`). Same shape as a Graph webhook: public HTTPS endpoint, subscription rows, renewal concerns.

---

## 6. Fit against THIS repo's domain

### (a) Recurring Event → Outlook master + instances

CONTEXT.md:32-33 — "An **Event** that regenerates occurrences on a fixed schedule (frequency + interval), **expanded virtually at read time**." Plus CONTEXT.md:36-38 **Exception Override** — "A user edit to a single occurrence… stored separately without altering the schedule."

Mapping is **good on the way out**:
- Feed one VEVENT per master, carrying `RRULE` — the client expands it. That is exactly what `ics.ts:105-140` already emits. Virtual expansion stays ours; Outlook never sees N rows.
- A cancelled occurrence must become `EXDATE` (or `STATUS:CANCELLED` for the whole series). The repo stores cancellation as an Exception Override (`src/routes/api/events/[id]/ics/+server.ts:65-68` currently *404s* a cancelled occurrence rather than exporting `EXDATE`). **This is a real gap for a feed** — a cancelled single occurrence currently vanishes instead of being marked. Effort: small, but it must be fixed or the family sees the cancelled event reappear in Outlook.
- A modified single occurrence → export as a standalone VEVENT with the master's UID plus `RECURRENCE-ID` (RFC 5545 §3.8.4.4). `buildIcsEvent` has **no `RECURRENCE-ID` support** (`ics.ts:105-140`). Also a gap.

Mapping is **hard on the way in** (route 2/3):
- Graph returns **expanded occurrences** from `calendarView`, each with `seriesMasterId` back to the master and `type: occurrence|exception|seriesMaster` ([event resource](https://learn.microsoft.com/en-us/graph/api/resources/event)). `calendarView` gives occurrences and exceptions but **not the RRULE** — you get the master via `GET /me/events/{id}` and read `recurrence` ([event resource](https://learn.microsoft.com/en-us/graph/api/resources/event)).
- ⇒ Rebuilding a Recurring Event in the app's virtual model from Graph requires: group by `seriesMasterId`, fetch the master for `recurrence`, and treat each `exception` as an Exception Override (CONTEXT.md:36-38). That mapping is *doable* and the domain names line up — but it is the actual engineering content of route 2, and it must be written as an explicit mapper with tests, not a naive event-by-event import. If exceptions don't map, the app ends up with N one-off Events, silently destroying the Recurring Event.

### (b) Recurring Tasks and Recurring Bills — **cannot sync to a calendar, by design**

CONTEXT.md:62-64 **Recurring Task**: "Exactly one live occurrence exists at a time — the **cursor**. Completing snaps the next one to today + n×interval… **One row per task — no occurrence expansion.**" CONTEXT.md:66-68 **Recurring Bill**: "its dueDate doubles as the cursor… spend reports and lists read the cursor due, so a recurring bill appears **once per period, never as materialized occurrences**."

These are explicitly **anti-materialisation** records. A calendar feed is inherently materialisation (Outlook stores expanded instances). So:
- You cannot export a Recurring Task or Recurring Bill as a calendar series **without violating the domain definition**.
- The only shape that doesn't lie is a **read-only "due" marker**: emit one VEVENT per *current* cursor due date, no RRULE. This is defensible — it exports the cursor, exactly as the domain says the cursor is the occurrence. But it must be **labelled distinctly** (e.g. title prefix "Task due:" / "Bill due:") so the family doesn't mistake a cursor for a scheduled event, and it must be **excluded from the Events calendar** the family subscribes to, or offered as a *second* feed.
- Recommendation: **do not put Tasks or Bills in the first feed at all.** Ship Events-only (route 1), then a separate opt-in "due dates" feed if asked for. Mixing them pollutes the Events view, which is the thing people actually subscribe to.

### (c) Anonymous Account / Claiming — **the integration is Claiming-gated by construction**

CONTEXT.md:9-11 **Anonymous Account**: "A server-side account created silently on first visit, **with no email attached. Full app access, no sync.**" CONTEXT.md:13-14 **Claiming**: "Attaching a verified email to an Anonymous Account, making its data **syncable across devices**." CONTEXT.md:159 — "Anonymous users are warned their data cannot sync without Claiming."

- Graph sync requires an **OAuth authorization-code redirect with a user present**. An Anonymous Account has no email, no Microsoft identity, no consent surface. **There is no place to put the sync integration pre-Claiming.** This is not an implementation gap; the domain already declares "no sync" for Anonymous Accounts (CONTEXT.md:9-11). Any sync UI must sit behind the Claiming flow.
- Route 1 (ICS feed) **sidesteps this entirely** — a bearer URL needs no identity at all. That is a second, independent reason route 1 is the right first rung: it works *today*, for anonymous users, with no Claiming nudge.
- Domain-fit consequence worth writing into a future issue: Claiming is the natural consent moment. Adding "connect Outlook" to the Claiming success screen costs zero extra explanation — the user has just proven email ownership. `CALENDAR_SYNC_MICRO_COPY` territory.

### (d) Privacy posture — where a Microsoft sync sits

CONTEXT.md:146-148 **Receipt**: "A photo of a bill, **PROCESSED AND DELETED**: parsed on-device into text and numbers, **never uploaded or stored**." CONTEXT.md:150-151 **OCR Chain**: Chrome Prompt API (on-device) → native bridge → tesseract.js → **opt-in Azure Document Intelligence (cloud, per-scan consent, only when server-configured)**.

The repo's stance: **image bytes never leave the device; cloud OCR is a last rung behind explicit per-scan consent and is opt-in.** A Microsoft sync does not touch that stance — no Receipt images flow through it, and `event` payloads carry only `subject`/`body`/`location`/`attendees`. But it *does* sit at the same altitude:
- Route 1 exports **family calendar content** to a URL Microsoft fetches server-side, unencrypted-at-rest-in-our-control, on a ~3-hour loop, into Microsoft's mailboxes. That is real data egress. It needs the same explicit, revocable, per-family opt-in treatment the OCR cloud rung gets.
- Route 2/3 exports the same content **plus** an OAuth grant over a mailbox, and requires storing refresh tokens server-side. That is a materially larger privacy surface than the OCR rung — it is a standing mailbox-scoped credential, not a one-shot per-scan consent.
- The correct framing: **receipt images are categorically excluded from sync** (no image bytes exist server-side to sync — CONTEXT.md:146-148 — so the stance is structurally preserved), but **event content is synced with the user's knowledge and consent, revocably.** State that in the UI. Never let a sync toggle imply anything about receipt images.

---

## 7. Cost / limits / admin burden

### Is Graph free?
Yes for calendar.
> "Most Microsoft Graph APIs are **standard** APIs… Access to standard APIs within the defined usage thresholds is **available as part of the user license without additional costs**." — [Overview of metered APIs and services in Microsoft Graph](https://learn.microsoft.com/en-us/graph/metered-api-overview)

The entire current metered list is **one** API, unrelated to calendars: "SharePoint and OneDrive for Business `assignSensitivityLabel` | $0.00185 (USD) per API call" ([Metered APIs and services in Microsoft Graph](https://learn.microsoft.com/en-us/graph/metered-api-list), last updated 2026-04-02). Teams APIs stopped being metered 2025-08-25. **Calendar read/write: $0.** The real cost is engineering + consent admin burden, not licensing.

### Mailbox / tenant caps
No mailbox-count cap. What exists is throttling (see §3 table: 10,000 req / 10 min and 4 concurrent per app+mailbox; 130,000 / 10 s per app across all tenants) and the attendee/message cap: "The maximum number of attendees included in an event, and the maximum number of recipients in an `eventMessage`… is **500**" ([event resource](https://learn.microsoft.com/en-us/graph/api/resources/event)).

### The consent wall — this is the real admin burden

**Load-bearing fact.** The Microsoft-managed default user consent policy — which is "**also the default for a new tenant**" — lists, verbatim, among the permissions end users **cannot** consent to:

> `Calendars.Read`, `Calendars.ReadBasic`, `Calendars.ReadWrite`, `Calendars.Read.Shared`, `Calendars.ReadWrite.Shared`

— [Manage app consent policies](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies), "Microsoft recommended current settings" → "Let Microsoft manage your consent settings".

There is **no calendar-app exemption**. The companion mail-client policy allow-lists only Apple Mail, Spark, eM Client, Samsung Mail, Android-Mail and Thunderbird — no calendar product (same page). Admin consent is also mandatory for the *application* permissions `Calendars.Read` and `Calendars.ReadWrite` ([permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)).

| User's account type | Can they self-consent to `Calendars.ReadWrite`? |
|---|---|
| Work/school Microsoft 365, tenant on recommended/Microsoft-managed policy | **No** — admin consent required, and there is no request button unless the admin enabled the admin-consent workflow ([Configure how users consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)) |
| Work/school Microsoft 365, tenant on a custom policy that permits it | Yes |
| **Personal Microsoft account (Outlook.com/Hotmail)** | Yes — "The `Calendars.ReadWrite` delegated permission is available for consent in personal Microsoft accounts" ([permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)) |

That last row is the strategically important one: **the personal `@outlook.com` path has no admin in the loop.** A family app targeting consumer Microsoft 365 accounts can ship delegated Graph consent without any admin story. Work/school accounts are effectively excluded unless the user is an admin or the IT shop pre-consents.

### Publisher verification / Partner Center
Required for the badge and for enterprise adoption: a **Microsoft Partner Center (CPP) account** verified against a DNS-verified domain, an Entra-registered work/school tenant associated with the PGA, MFA on the verifying operator, and roles in both systems ([Publisher verification overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)). Hard requirement detail: "the app's publisher domain can't be `*.onmicrosoft.com` to be publisher verified" — so a solo dev on a personal tenant must register a real domain first. Consequence: "if risk-based step-up consent is enabled, users can't consent to most newly registered multitenant apps that aren't publisher verified" (same page). Also, admins are *recommended* to set consent to "Allow user consent for apps from **verified publishers**, for selected permissions" ([Configure how users consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)) — so an unverified app is invisible to the recommended enterprise configuration. Partner Center verification is a multi-day process with legal/business paperwork, and is a genuine schedule risk for a family app.

### Admin burden summary
| Concern | Route 1 (ICS) | Route 2/3 (Graph) |
|---|---|---|
| Entra app registration | none | yes, multi-tenant |
| Publisher verification / Partner Center | none | recommended; effectively required for work/school adoption |
| User consent screen | none | yes, plus risk-based step-up consent policy interaction |
| Admin consent required | none | yes for any work/school Microsoft 365 tenant on the default policy |
| Refresh-token storage + re-auth | none | yes; 90-day sliding, revocable out-of-band |
| Public HTTPS receiver | none | yes (webhooks), with the `validationToken` echo |
| Ongoing ops | rotate a URL | renew subscriptions, handle 429 `Retry-After`, handle 410 full-resync, handle revoked tokens |

---

## Tagged backlog

- `[calendar-sync][outlook][cheap]` Family-scoped `GET /api/family/[id]/calendar.ics` — Events only, secret path, `text/calendar`, no auth. Unblocks anonymous users.
- `[calendar-sync][outlook][cheap]` Onboarding copy must say "add it on Outlook on the web first" — mobile has no documented ICS-URL entry, but server-side subscriptions do reach mobile ([KB 4025591](https://learn.microsoft.com/en-us/troubleshoot/outlook/calendaring/cannot-add-an-internet-calendar)).
- `[calendar-sync][outlook][cheap]` Set `EXDATE` for cancelled occurrences instead of 404 (`src/routes/api/events/[id]/ics/+server.ts:65-68`); add `RECURRENCE-ID` for modified occurrences (`ics.ts:105-140` has neither).
- `[calendar-sync][outlook][cheap]` Tell users refresh is 3–4h, worst case >24h ([KB 4025591](https://learn.microsoft.com/en-us/troubleshoot/outlook/calendaring/cannot-add-an-internet-calendar), [Import or subscribe…](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web)).
- `[calendar-sync][outlook][blocking]` Router reminders: `EXDATE` + `RECURRENCE-ID` must land before the feed ships, or cancelled events resurrect in Outlook.
- `[calendar-sync][outlook][blocking]` Consent wall: `Calendars.ReadWrite` is excluded from the default tenant consent policy ([manage-app-consent-policies](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies)) — decide early whether we target personal Microsoft accounts only.
- `[calendar-sync][outlook][identity]` "Connect Outlook" belongs on the Claiming success screen — email ownership is already proven (CONTEXT.md:13-14).
- `[calendar-sync][graph][risk]` Delta has no `$select` ([delta-query-events](https://learn.microsoft.com/en-us/graph/delta-query-events)) and Outlook `event` tokens have **no fixed TTL** ([delta-query-overview](https://learn.microsoft.com/en-us/graph/delta-query-overview)) — full resync must be a routine path.
- `[calendar-sync][security]` The Graph webhook handler echoes `?validationToken=` into a `text/plain` response within 10s ([webhook delivery](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)) — needs an explicit injection/XSS test.
- `[calendar-sync][recurring-tasks]` Recurring Tasks/Bills are cursor records, not calendars (CONTEXT.md:62-68) — if ever exported, separate opt-in feed, labelled, no RRULE. Never in the Events feed.
- `[calendar-sync][privacy]` Sync toggle copy must state receipt images are categorically not synced (CONTEXT.md:146-148).
- `[calendar-sync][caldav]` Close out: no server-side CalDAV in Exchange Online ([Clients and mobile in Exchange Online](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/clients-and-mobile-in-exchange-online); [Exchange Online service description](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-service-description)).

## UNVERIFIED (not resolvable from primary sources at check time)

- Whether **new Outlook for Mac** accepts a raw external `.ics` URL (no support article; only a community answer).
- Whether **Outlook iOS/Android** accepts a raw external `.ics` URL — no documented entry point; treated as "no", with the OWA-first workaround as the supported path.
- Whether Microsoft has any internal plan for server-side CalDAV — no roadmap entry found on the Microsoft 365 roadmap.
- Whether `$expand` is *prohibited* (vs merely undocumented) on Graph calendar endpoints.
- RRULE/UID round-trip fidelity of `ical.js` / `ical-generator` / `rrule` beyond their documented scope — not tested here.
- Whether `@microsoft/microsoft-graph-client` 3.0.7's 3-year publish gap is a maintenance signal or just a quiet-major policy; the Kiota-based successor was not evaluated.
- `getSchedule` may require `Calendars.Read` despite docs saying `Calendars.ReadBasic` ([Q&A 5509299](https://learn.microsoft.com/en-us/answers/questions/5509299/)).

## Sources (primary)

- [KB 4025591 — Can't add an Internet calendar (Outlook)](https://learn.microsoft.com/en-us/troubleshoot/outlook/calendaring/cannot-add-an-internet-calendar)
- [Import or subscribe to a calendar in Outlook.com / Outlook on the web](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web)
- [Calendar sharing in Microsoft 365](https://support.microsoft.com/en-us/office/calendar-sharing-in-microsoft-365-b576ecc3-0945-4d75-85f1-5efafb8a37b4)
- [Share your calendar in Outlook on the web](https://support.microsoft.com/en-us/outlook/share-your-calendar-in-outlook-on-the-web)
- [Introduction to publishing Internet Calendars](https://support.microsoft.com/en-us/outlook/introduction-to-publishing-internet-calendars)
- [Shared calendars updates in Outlook for Windows](https://support.microsoft.com/en-us/office/shared-calendars-updates-in-outlook-for-windows-7b856d16-840f-41cc-997d-a95dab7a6414)
- [How do I open a shared calendar? (Outlook mobile)](https://support.microsoft.com/en-us/outlook/how-do-i-open-a-shared-calendar)
- [Sync your account in Outlook to the Microsoft Cloud](https://support.microsoft.com/en-us/outlook/getstarted/sync-your-account-in-outlook-to-the-microsoft-cloud)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [List calendars](https://learn.microsoft.com/en-us/graph/api/user-list-calendars) · [List calendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview) · [List events](https://learn.microsoft.com/en-us/graph/api/user-list-events) · [Get event](https://learn.microsoft.com/en-us/graph/api/event-get) · [event resource](https://learn.microsoft.com/en-us/graph/api/resources/event)
- [Paging in Microsoft Graph](https://learn.microsoft.com/en-us/graph/paging)
- [Get incremental changes to events in a calendar view](https://learn.microsoft.com/en-us/graph/delta-query-events) · [event: delta](https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0) · [Use delta query to track changes](https://learn.microsoft.com/en-us/graph/delta-query-overview)
- [Set up notifications for changes in resource data](https://learn.microsoft.com/en-us/graph/change-notifications-overview) · [subscription resource](https://learn.microsoft.com/en-us/graph/api/resources/subscription) · [Update subscription](https://learn.microsoft.com/en-us/graph/api/subscription-update) · [Webhook delivery](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)
- [Throttling guidance](https://learn.microsoft.com/en-us/graph/throttling) · [Service-specific throttling limits](https://learn.microsoft.com/en-us/graph/throttling-limits)
- [Overview of metered APIs](https://learn.microsoft.com/en-us/graph/metered-api-overview) · [Metered APIs and services](https://learn.microsoft.com/en-us/graph/metered-api-list)
- [Refresh tokens in the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens) · [OIDC scopes (`offline_access`)](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc)
- [Publisher verification overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview) · [Manage app consent policies](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies) · [Configure how users consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)
- [Clients and mobile in Exchange Online](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/clients-and-mobile-in-exchange-online) · [Exchange Online service description](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-service-description) · [Deprecation of EWS](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-ews-exchange-online) · [Migrate EWS apps to Microsoft Graph](https://learn.microsoft.com/en-us/graph/migrate-exchange-web-services-overview)
- [Vercel Cron Jobs — Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) · [Cron Jobs](https://vercel.com/docs/cron-jobs)
- [RFC 5545 (iCalendar)](https://www.rfc-editor.org/rfc/rfc5545) §3.8.4.7 UID · [RFC 4791 (CalDAV)](https://www.rfc-editor.org/rfc/rfc4791) · [RFC 6764 §3 (CalDAV SRV labels)](https://www.rfc-editor.org/rfc/rfc6764#section-3) · [IANA URI Schemes registry](https://www.iana.org/assignments/uri-schemes/uri-schemes.xhtml)
- [npm registry](https://registry.npmjs.org/) · [npm downloads API](https://api.npmjs.org/downloads/point/last-week/)