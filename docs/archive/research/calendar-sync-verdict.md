# Research: calendar sync — Google / Outlook / Apple, cross-provider verdict

Checked **2026-09-30**. Detail + full citations in the three provider docs:

- `docs/research/calendar-sync-google.md` — Google Calendar API v3, CalDAV, ICS subscribe
- `docs/research/calendar-sync-outlook.md` — Microsoft Graph, CalDAV, ICS subscribe
- `docs/research/calendar-sync-apple.md` — iCloud CalDAV, app-specific passwords, EventKit, ICS subscribe

Everything below traces to those files or to a primary source cited inside them. Anything the agents could not confirm is marked **UNVERIFIED** in the provider doc; do not re-litigate it here.

## Answer

Yes for all three providers. **No — for none of them is two-way sync worth building on this deployment.** One route survives contact with reality on all three: a **tokenised, read-only, anonymous `.ics` feed we host**, which every provider's client can subscribe to. Effort **S**, no OAuth, no consent screen, no token storage, works pre-Claiming.

The rungs above it each die on a provider-specific wall:

| Provider | Wall above the feed |
|---|---|
| Google | every Calendar scope is **sensitive** → brand + additional app verification + an **unlisted YouTube demo video** before public launch; `events.watch` channels expire in 7 days with no auto-renew; CalDAV basic-auth **401s** (OAuth-only) and buys nothing over the JSON API |
| Microsoft | `Calendars.Read/ReadBasic/ReadWrite` are **excluded from end-user consent by the default tenant policy** (also the new-tenant default) → any work/school M365 user needs an admin; `event` subscriptions expire at **10,080 min** and must be renewed forever; **no server-side CalDAV endpoint exists** — that rung is a dead end, not a hard one |
| Apple | **no public calendar API and no self-serve OAuth**; CalDAV needs an Apple Account **app-specific password** — a whole-account bearer token, unscoped, revocable only wholesale — under an iCloud ToS clause that names "accessing the Service through any automated means". Apple now documents an OAuth path for "supported third-party applications" (support.apple.com/en-us/121539) but **publishes no enrollment process** → not plannable |

## Route ladder (effort per provider)

| Route | Direction | Google | Outlook | Apple |
|---|---|---|---|---|
| **1. Remote ICS subscription** | app → provider, read-only | **S** | **S** | **S** |
| 2. Provider API / CalDAV read-only | provider → app | M | M | M (ToS-grey) |
| 3. Two-way write + push/webhooks | both | L | L | L (ToS-grey) |
| 4. CalDAV two-way | both | L, pointless | **dead end** | L, ToS-grey |
| 5. On-device framework | local only | — | — | EventKit, L, native-only |

Route 1 is one route, not three. Same bytes, same endpoint, three subscribe flows.

## Why push is architecturally wrong here, not just expensive

- **Vercel Functions are request-scoped, no daemon.** Every provider's push mechanism needs a long-lived receiver **plus** a renewal timer on a sub-week cycle. Vercel Hobby cron fires **once per day** (±59 min) and *rejects deployment* for sub-daily expressions; this repo's only cron is weekly (`vercel.json` → `0 4 * * 1`, cleanup only). Google channels default to TTL 604800s with **no automatic renewal**; Graph `event` subscriptions cap at 10,080 min.
- **Google itself says push is an optimization, not the core loop**: push "lets you eliminate the extra network and compute costs involved with polling", and "notifications are not 100% reliable". Incremental `syncToken` polling is the recommended path.
- ⇒ If two-way is ever wanted: **pull-only incremental sync, driven by a user action (app open) plus a daily sweep on Pro.** Less machinery, no expiry timer.

## Domain fit

- **Sync Events only.** Recurring Task (CONTEXT.md:62-64) and Recurring Bill (:66-68) are **cursor rows** — "One row per task — no occurrence expansion". The next due date is a function of *user action*, not of a calendar date. Emitting occurrences would materialize exactly what the domain forbids. Google has no `VTODO` surface; Apple's would be the natural home but a cursor is not a `VTODO`.
- **Recurring Event maps well everywhere** — one row + `RRULE`, expanded virtually at read time (:32-34). iCloud is the *best* fit (RRULE-native on the wire, `RECURRENCE-ID` maps 1:1 onto **Exception Override** :36-38); Google/Outlook both need an explicit master↔instance mapper.
- **Identity join key = `iCalUID`** (Google) / **`seriesMasterId`** (Graph; Graph's `iCalUId` is per-occurrence and read-only, so unusable for writes). Never join on `id`.
- **Anonymous Account gate** (:9-11 "no email attached. Full app access, no sync"). Route 1 works pre-Claiming — no identity anywhere. Every other route needs an OAuth/credential consent against a verified email, i.e. **post-Claiming only**. "Connect Google/Outlook" is a natural **Claiming moment** (email ownership just proven).
- **Privacy**: Receipt images are categorically excluded — no image bytes exist server-side to leak (:146-148, :164). Event content (kids' schedules, school, medical, location) is a real egress surface, so the feed must be **per-family opt-in, revocable, token-rotatable**. Never emit Receipt Line Items or Spend Detail; never emit Private Tasks (:50).

## Prerequisites before any feed ships (shared, blocking)

Current ICS layer: hand-rolled, no iCalendar lib, no deps (`package.json:90-115`).

| Fix | Where | Why blocking |
|---|---|---|
| `RECURRENCE-ID` + `SEQUENCE` for Exception Override | `src/lib/utils/ics.ts:105-140`, `src/routes/api/events/[id]/ics/+server.ts:64-81` | today an exception re-emits the **master's UID with no recurrence id** → malformed VEVENT; consumer mis-renders. Most urgent on Apple (no provider-side identity signal to recover from) |
| `STATUS:CANCELLED` / `EXDATE` for cancelled occurrences | `src/routes/api/events/[id]/ics/+server.ts:65-68` currently 404s | a cancelled occurrence **resurrects** in the consumer's calendar |
| Capture `UID` on import | `src/lib/server/services/icsImportService.ts:5-17` (`IcsEventDraft` has no `uid`) | import is UID-blind → no round-trip, new identity every pass |
| `VTIMEZONE` + `TZID` instead of fixed UTC `Z` | `ics.ts:6-12`, `:53-56`, `:143-148` | recurring wall-times drift across DST, permanently, on every device. Fixable provider-side **only** on the Google Calendar API write route — on a feed or CalDAV it is ours alone |
| `PRODID` on `VCALENDAR` | `ics.ts:143-148` | required by RFC 5545 |
| `Cache-Control: no-cache, must-revalidate`; no attachment disposition; no session auth | new route; today `+server.ts:23-25`, `:84-88` | provider fetchers carry no session cookie and ignore disposition |

## Recommendation

Ship **route 1 only**: `GET /feed/[token].ics` — anonymous, family-scoped, high-entropy rotatable token (stored hashed), `text/calendar`, Events only, after the blockers above. Reuse `buildIcsCalendar`/`buildIcsEvent` as-is once they are corrected.

Onboarding copy, per provider, because the entry points genuinely differ:

- **Google** — *Other calendars → + → From URL*, **desktop web only** ("you must use a computer web browser"). Refresh: last official number was **24h**, now unstated → assume ≥24h.
- **Outlook** — **"add it on Outlook on the web first"** (*Add calendar → Subscribe from web*). Mobile has no documented ICS-URL entry, but a server-side subscription created on OWA reaches every client. Refresh ~**3–4h**, worst case >24h.
- **Apple** — *Add Calendar → Subscribe to an external, read-only calendar*, and **choose iCloud** as the account so one subscription reaches every Apple device (support.apple.com/en-us/102301). Apple publishes no cadence → assume ≥24h.

Serve plain `https`. `webcal://` is an Apple clickable-link convention, IANA-provisional, absent from RFC 5545 and from Google's and Microsoft's docs — a nicety, never the only URL.

## When to reconsider the rungs above

| Trigger | Reopen |
|---|---|
| Users actually want **inbound** (their existing calendars showing in Family Planz) | Google API read (M) + CalDAV read (M) |
| Vercel **Pro** cron + a stated need for near-real-time | Graph two-way via **delta polling** (not webhooks); Google two-way via incremental sync |
| Google publishes a self-serve path around sensitive-scope verification | Google two-way |
| Decided to target **personal @outlook.com only** | Graph consent, no admin in the loop |
| Apple publishes an enrollment process for "supported third-party applications" (121539) | supersedes iCloud CalDAV, retires the app-specific-password blocker |
| Someone wants bill/task dates on a phone | separate **opt-in, labelled, no-RRULE** "due dates" feed — never in the Events feed |

## Open questions worth one experiment

- Does Apple honour `STATUS:CANCELLED` on a subscribed feed? (UNVERIFIED for all three providers — RFC 5545 §3.8.1.11 permits it, no provider documents it.)
- Do provider fetchers honour `ETag`/`Last-Modified`? (UNVERIFIED everywhere → assume no, serve full body.)
- iCloud CalDAV capability matrix: Apple documents **no** RFC 4791 support profile, no discovery path, no rate limits, no `VTODO` surface. Every number would have to be measured. Not worth measuring unless route 1 demonstrably falls short.

## Libraries — do not adopt

| Package | Status |
|---|---|
| `dav` | last publish 2018-08-11, 54 open issues → dead |
| `node-caldav` | last publish 2014-06-20, ~1 download/week → dead |
| `ts-caldav` | only live CalDAV client, names iCloud explicitly — but ~1k installs/week, unproven; and it wants the *server* to expand recurrence, the opposite of this repo's virtual model |
| `@microsoft/microsoft-graph-client` | 3.0.7, no release in ~3 yrs, zero `fetch` polyfills |
| `googleapis` | 12M dl/wk but enormous tree for 4 methods; `google-auth-library` is the right-sized dep if that rung is ever taken |
| `ical.js` / `ical-generator` | the credible pair **if** lossless two-way is ever required. Not needed for route 1 |