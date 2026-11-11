# Research: Apple Calendar / iCloud Calendar sync for Family Planz

Checked: **2026-09-30**. Primary sources only (Apple Support, Apple Developer, Apple legal, IETF RFCs, npm registry + GitHub API, Android/Google docs, repo files). Anything I could not confirm from a primary source is tagged **UNVERIFIED**.

---

## Verdict

**Apple exposes no public calendar REST API and no self-serve OAuth for iCloud Calendar** — there is no Google-Calendar-API or Microsoft-Graph equivalent, and the only Apple Developer surface for Calendar is EventKit, which is on-device only (<https://developer.apple.com/documentation/eventkit>: *"Create, view, and edit calendar and reminder events"*). Apple's iCloud-for-developers page lists CloudKit, APNs, Identity & Trust and Dashboards — **no Calendar API** (<https://developer.apple.com/icloud>). **One important correction to the usual framing, found late and decision-relevant:** Apple *does* now document an OAuth-style path for **"supported third-party applications"** covering iCloud Mail, Calendar and Contacts — "When prompted, click **Allow** to authorize the app", revocable under *Account Data Sharing* at account.apple.com (<https://support.apple.com/en-us/121539>, *Published Date: October 07, 2025*). **No application process is published anywhere**, so whether a web server can self-serve into that program is **UNVERIFIED**. Apple sync *is* possible on every other rung, and the cheapest rung is the same as Google's: a tokenised read-only `.ics` feed — **S** (~1–2 days), and it is the **only** Apple rung that works for an unclaimed **Anonymous Account**. Top 3 blockers: (1) **the credential problem** — CalDAV auth is an Apple Account email + a hand-generated app-specific password, which is an account-wide bearer token we would have to store server-side, under an iCloud ToS clause that explicitly names "accessing the Service through any automated means, like scripts"; (2) **Apple publishes none of it** — not the `caldav.icloud.com` hostname, not the discovery path, not a fetch cadence, not rate limits, not VTODO support, so every operational detail is guesswork; (3) **Apple's setup friction is paid by exactly the user the feed route already serves** — generating an app-specific password requires 2FA plus a trusted device, so only people already on an Apple device can use CalDAV at all, and those are the people the free feed route targets.

## Route ladder

| # | Route | Direction | Effort | Credential | Apple-side approval | Deployable from the web app? |
|---|-------|-----------|--------|-----------|--------------------|------------------------------|
| 1 | Subscribed ICS feed | in → Apple Calendar (read-only) | **S** | none (opaque URL) | none | **yes** — anonymous route |
| 2 | "Supported third-party app" OAuth (121539) | both | **L** + blocked | OAuth (undocumented) | **yes, gated — process unpublished** | unknown / **UNVERIFIED** |
| 3 | iCloud CalDAV read | Apple → app | **M** | Apple Account + app-specific password | no | yes, but see ToS |
| 4 | iCloud CalDAV two-way | both | **L** | Apple Account + app-specific password | no | yes, but see ToS |
| 5 | EventKit (native app only) | local on-device read/write | **L** | OS consent prompt | App Store rules | **no** — never reaches the web app |

---

## 0. The framing fact, stated precisely

**No public calendar REST API. Confirmed.** Apple's developer portal exposes no Calendar service; the only Calendar framework is EventKit, which is a local framework ("the calendar database" on the device), not a service client.

**No OAuth for CalDAV. Confirmed.** Apple's only documented third-party machine access to iCloud data is the app-specific password (<https://support.apple.com/en-us/102654>, *Published Date: October 08, 2025*):
> "Some apps made by developers other than Apple ask you to sign in to your Apple Account, so that the app can access information like mail, contacts, and calendars that you store in iCloud. To help make sure that your Apple Account password can't be stored or collected by the app, you can choose to create an Apple Account password to use only with that app."

**But there is now a third path, and it is the reason this doc exists.** The same page links onward:

> "For supported third-party apps that access your iCloud Mail, Calendar, and Contacts, you can [authorize the app using your Apple Account](https://support.apple.com/en-us/121539) instead of using an app-specific password."

And <https://support.apple.com/en-us/121539> (*"Access your iCloud Mail, Calendar, and Contacts in third-party apps"*, *Published Date: October 07, 2025*):
> "You can access your iCloud Mail, Calendar, and Contacts in supported third-party applications across your devices after you authorize the app using your Apple Account."
> "When you set up an account in your supported third-party application, enter your Apple Account email address. When prompted, click **Allow** to authorize the app to access your data and return to the third-party app."
> "If an app doesn't support this, you can sign in using an app-specific password instead."
> "**Revoke your authorization:** … Sign in at account.apple.com … Choose Sign-In and Security … select **Account Data Sharing**. Select "Remove access" for the app that you want to revoke your authorization from."

| What is known | What is **not** |
|---|---|
| A real, shipped, Apple-documented OAuth-style consent for **iCloud Calendar specifically** | **How an app becomes "supported".** No public list, no application form, no developer-portal entry, no eligibility criteria. |
| Revocable, per-app, from the user's account page | Whether the scope is calendar-only or Mail+Contacts+Calendar. 121539 bundles all three; **UNVERIFIED** whether they can be requested separately. |
| Applies to third-party apps generally, not only App Store apps (121539 says "applications", not "apps on the App Store") | Whether a **web server** can be an authorized client at all, or whether this is restricted to native iOS/macOS apps. **UNVERIFIED.** |

**Evidence that an application/interest process exists but is not public:** an Apple Developer Forums thread titled **"iCloud OAuth2 interest form"** exists, whose opening line reads "I would like to apply for iCloud Calendar access through Apple Account authorization, without requiring users to generate app-specific passwords" — <https://developer.apple.com/forums/thread/847329>. **Apple blocks automated access to developer.apple.com/forums** (the fetch returned a browser-verification interstitial), and the desktop browser was not connected during this research, so **I could not read Apple's reply**. Whether Apple accepts self-serve enrollment, and on what timeline, is **UNVERIFIED**.

**Action:** this rung is not plannable today. Do not design against it. Re-check annually; if Apple opens enrollment, it supersedes rungs 3–4 and removes blocker (1) entirely.

---

## 1. iCloud CalDAV (two-way in principle) — M read / L two-way

### 1.1 The endpoint is not an Apple primary source — flagging this explicitly

**`https://caldav.icloud.com` is third-party-sourced.** Apple publishes no CalDAV settings page for iCloud (Apple maintains a public iCloud Mail IMAP/SMTP settings page; there is no Calendar equivalent — its absence is what forces every third-party client to hardcode the hostname). What Apple *does* document is that iCloud **is** a CalDAV account type:

- iPhone/iPadOS: *"**Add a CalDAV, CardDav, or LDAP account:** Tap Add Other Account, choose an option, then enter your server and account information."* — <https://support.apple.com/guide/iphone/set-up-mail-contacts-and-calendar-accounts-ipha0d932e96/ios>
- macOS: *"If your calendar account provider isn't listed … Choose **Other CalDAV Account** … Automatic / Manual / Advanced"* — <https://support.apple.com/guide/calendar/add-calendars-and-calendar-accounts-icl4308d6701/mac>

Strongest corroboration for the hostname, from a maintained library's own "Known Working Servers" table (npm registry README for `ts-caldav@0.4.3`, <https://www.npmjs.com/package/ts-caldav>):

| Provider | Endpoint Example |
|:--|:--|
| **iCloud** | `https://caldav.icloud.com/` |
| Google | `https://apidata.googleusercontent.com/` |
| Yahoo | `https://caldav.calendar.yahoo.com` |
| GMX | `https://caldav.gmx.net` |
| Fastmail | `https://caldav.fastmail.com` |
| Nextcloud | `https://your-host/remote.php/dav` |

with the note: *"Some servers may require enabling CalDAV support or generating app-specific passwords, especially iCloud and Fastmail."*

**Assessment:** the hostname is consistent across independent clients and vendors and the protocol-level risk of it being wrong is low, but it is **not** an Apple primary source. Treat as **weakly sourced**; do not present it to users as "Apple's documented server".

### 1.2 Authentication

| Property | Fact | Source |
|---|---|---|
| Mechanism | Apple Account email + **app-specific password**, sent as HTTP Basic | 102654; `ts-caldav` `auth: { type: "basic", username, password }` |
| No OAuth for CalDAV | Apple's docs offer app-specific password *or* the separate "supported app" authorization; the latter is **not** documented as a CalDAV credential | 102654, 121539 |
| No API key | Apple's docs contain no app registration, no client ID, no key issuance | absence in 102654 / 121539 / developer.apple.com/icloud |
| 2FA required | *"To generate and use app-specific passwords, your Apple Account must be protected with two-factor authentication."* | 102654 |
| Generation | account.apple.com → *Sign-In and Security* → *App-Specific Passwords* → *Generate* | 102654 |
| Max active | *"You can have up to **25** active app-specific passwords."* | 102654 |
| Bulk revocation | *"any time you change or reset your primary Apple Account password, **all** of your app-specific passwords are revoked automatically"* | 102654 |
| Trusted device needed | Apple Account recovery text references "two-factor authentication enabled for your Account and a trusted device (devices on which you have signed into your Account using two-factor authentication)" | iCloud Terms §I, <https://www.apple.com/legal/internet-services/icloud/us-en/terms.html> |
| Revocation scope | Per-password, or *Revoke All*. No per-resource scope — a revoked password kills the app's iCloud access entirely | 102654 |

**Onboarding cost:** every user performs a manual, browser-based, out-of-band flow on a device that must already be trusted. It cannot be automated, and Apple exposes no endpoint to mint the credential. (Third-party vendors state the password is 16 characters and hand-generated — <https://developer.nylas.com/docs/cookbook/calendar/apple-calendar-api> — flagged as **third-party**, not Apple.)

### 1.3 Protocol support

| Concern | Spec | Note |
|---|---|---|
| CalDAV core | **RFC 4791**, *Calendaring Extensions to WebDAV (CalDAV)*, Proposed Standard — <https://datatracker.ietf.org/doc/rfc4791/doc.json> | The wire model for rungs 3–4 |
| Scheduling | **RFC 6638**, *Scheduling Extensions to CalDAV* — <https://datatracker.ietf.org/doc/rfc6638/doc.json> | **Correction to a common error: RFC 4792 is *Encoding Instructions for the Generic String Encoding Rules (GSER)*, not scheduling** (<https://datatracker.ietf.org/doc/rfc4792/doc.json>). Invitations/attendees are RFC 6638. |
| Principal discovery | **RFC 5397**, *WebDAV Current Principal Extension* — <https://datatracker.ietf.org/doc/rfc5397/doc.json> | Discovery shape: `/.well-known/caldav` → principal `PROPFIND` → calendar collections |
| iCalendar objects | **RFC 5545**, *iCalendar Core Object Specification* — <https://datatracker.ietf.org/doc/rfc5545/doc.json> | `VEVENT` (§3.6.1), `VTODO` (§3.6.2) |
| `VTODO` on iCloud | — | **UNVERIFIED.** Apple has no published statement about a Reminders/`VTODO` CalDAV collection at `caldav.icloud.com`. Apple's product split (Calendar vs Reminders are separate apps, separate iCloud toggles) makes it doubtful. Moot for this repo regardless — see §6(b). |
| Which iCloud features CalDAV covers | — | **UNVERIFIED.** Nothing from Apple states whether CalDAV exposes shared calendars, subscribed calendars, or Reminders. |

**The upside of CalDAV here is real and is the strongest technical argument for Apple as a target:** `RFC 4791`/`5545` is **RRULE-native on the wire**. A Recurring Event is one `VEVENT` with one `RRULE` and zero materialized instances. See §6(a).

### 1.4 Non-Apple-IDs, and Microsoft/Google accounts "inside iCloud"

- **Non-Apple email as the Apple Account:** Apple's docs are written throughout as "your Apple Account email address" (<https://support.apple.com/en-us/121539>), which implies an address other than an `@icloud.com` one is normal. Whether such an account has identical CalDAV entitlement is **UNVERIFIED**.
- **Google / Microsoft accounts inside iCloud:** **No.** Apple's own statement is that iCloud will not absorb a third-party account's data — *"Changing your default account to iCloud **won't move** any existing information from a third-party service to iCloud"* (<https://support.apple.com/en-us/102543>). Adding a Google/Microsoft account to the iCloud umbrella is a credential-storage convenience, not a calendar host. **A family member on Google/Microsoft Calendar is not reachable through any Apple route** — they use the Google rung (see `docs/research/calendar-sync-google.md`).

### 1.5 Apple quirks, limits, and known problems

| Question | Answer | Strength of source |
|---|---|---|
| Rate limits | **UNVERIFIED.** No Apple document states any request quota for iCloud CalDAV. | — |
| 503s / outages | Real but **not documented as a limit**. Apple publishes a service-availability page that includes iCloud Calendar (<https://www.apple.com/support/systemstatus/>), which is the only official signal. | weak |
| Undocumented behaviour | Guaranteed. Nothing about the protocol surface is documented (see §1.1). | — |
| `webcal://` accepted | **UNVERIFIED** for Apple. Apple says "the URL of the .ics file" / "the calendar's web address" — never `webcal://`. Same position as the Google rung: ship `https://`. | — |
| Does Apple rate-limit/ban server-side CalDAV clients in practice? | **No Apple primary source either way.** Widely reported as tolerated (larger vendors operate iCloud CalDAV at scale) but all such evidence is non-Apple. **UNVERIFIED.** | — |
| iCloud+ storage gating CalDAV | **UNVERIFIED.** The only relevant Apple text is iCloud Terms §III: *"If you have used more than 5GB of storage during this period, you may not be able to create any more iCloud backups or use **certain features** until you have reduced your storage."* — "certain features" is unenumerated, so it does **not** name Calendar. Apple's storage page lists backups, Photos, Drive, Files and Messages as the 5 GB consumers and never mentions Calendar (<https://support.apple.com/en-us/108922>) — suggestive, but it is an omission, not a statement. | weak |
| ToS restricting third-party CalDAV clients | **Yes, and this is the sharpest legal finding in the whole document.** See §1.6. | **strong** |

### 1.6 The ToS problem — read this before designing rungs 3 or 4

Apple's **iCloud Terms and Conditions** (<https://www.apple.com/legal/internet-services/icloud/us-en/terms.html>), **§V "Content and Your Conduct"**, prohibited-activity item **10**:

> "interfere with or disrupt the Service (**including accessing the Service through any automated means, like scripts or web crawlers**), or any servers or networks connected to the Service, or any policies, requirements or regulations of networks connected to the Service (including any unauthorized access to, use or monitoring of data or traffic thereon)"

A headless server on Vercel polling `caldav.icloud.com` on a schedule is, on its face, "accessing the Service through automated means". The clause is written against *disruption* ("interfere with or disrupt"), and a low-frequency, user-authorised, well-behaved client is not disrupting anything — so this is a **grey area, not a prohibition**. But it is a **real, current, citable clause**, it is Apple's only published statement on the subject, and no Apple source grants third-party CalDAV clients an exemption. Treat CalDAV as **ToS-risky**, state that in any user-facing copy, and never let it be the default.

A second, milder clause, **§IV.A "Your Account"**:
> "Don't reveal your Account information to anyone else. … you should not share your Account and/or password details with another individual."

An app acting for the account owner is not "another individual", and app-specific passwords exist precisely for this — so §IV.A is most likely satisfied. But note the asymmetry in Apple's own framing (102654): the app-specific password exists "to help make sure that **your Apple Account password** can't be stored or collected by the app". Apple designed it to keep the *primary* password out of third-party apps. **Apple says nothing about long-term server-side storage of the app-specific password itself.** Long-term server-side storage is therefore unaddressed by Apple, not sanctioned by it.

**Net:** the credential model is not what Apple designed for. A user can reasonably grant it (their explicit action, revocable, 25-password cap), but the app would be operating in an undocumented, unlicensed-by-omission corner. Google, by contrast, forces this exact decision through a documented sensitive-scope verification regime with a demonstration video (`docs/research/calendar-sync-google.md` §7) — Apple just has no regime at all.

---

## 2. Subscribed ICS feed (one-way, read-only) — S

**Can an iPhone/iPad/Mac add an external `.ics` URL? Yes — and Apple calls it read-only in so many words.**

| Platform | Path | Source |
|---|---|---|
| iOS / iPadOS | *Calendar* → *Calendars* button → *Add Calendar* → **"Subscribe to an external, read-only calendar"** → *Add Subscription Calendar* → enter the URL of the `.ics` file → *Find*. Also: "You can also subscribe to an iCalendar (.ics) calendar by tapping a link to it." | <https://support.apple.com/guide/iphone/use-multiple-calendars-iph3d1110d4/ios> |
| iOS / iPadOS (account path) | *Add Other Account* → *"Subscribe to iCal (.ics) calendars"* → *Add Subscribed Calendar* → URL | <https://support.apple.com/guide/iphone/set-up-mail-contacts-and-calendar-accounts-ipha0d932e96/ios> |
| macOS | *Calendar* → *File* → **New Calendar Subscription** → "Enter the calendar's web address, then click Subscribe" | <https://support.apple.com/en-us/102301> |
| Unsubscribe | *Info* button → *Unsubscribe* (or *Unsubscribe and Report Junk*) — "the calendar is reported to Apple as a suspected junk subscription" | iPhone guide; <https://support.apple.com/en-us/102444> |

**Read-only, per Apple's own wording.** "Subscribe to an external, **read-only** calendar" (iOS guide). Corollary: a subscribed calendar **cannot** accept invitations or send RSVPs — there is no writable calendar to attach a `PARTSTAT` to. Apple's docs contain **no** statement that subscribed calendars prompt for invitations; treat "no" as settled by the read-only framing rather than as a separate claim.

### 2.1 Correction: on current iOS/macOS, a subscription **can** live in iCloud and sync to all devices

The brief's premise ("subscribed calendars on iOS do NOT sync to iCloud") is **outdated**. Apple documents the opposite, in an article titled *Use iCloud calendar subscriptions* (<https://support.apple.com/en-us/102301>, *Published Date: May 22, 2026*):

> "Calendar subscriptions help you stay up to date with holidays, special events, and more. **When you add a calendar subscription to iCloud on your iPhone, iPad, or Mac, you can see it across all of your devices.**"

| Step | iOS 26 / iPadOS 26+ | iOS 18 / iPadOS 18 or earlier | macOS |
|---|---|---|---|
| Add | *Calendars* → *Add Calendar* → *Add Subscription Calendar* → URL → *Find* | *Calendars* → *Add Calendar* → *Add Subscription Calendar* → URL → *Subscribe* | *File* → *New Calendar Subscription* |
| **Put it in iCloud** | **"Next to Account, choose iCloud."** | **"Choose iCloud from the Account menu, then click Add."** | **"Next to Location, choose iCloud."** |
| Finish | *Done* | — | *OK* |

Apple shows the iCloud option for **both** current and legacy iOS, so this is not a new-iOS-only feature. **This materially raises the value of rung 1**: a Family Planz feed stored in iCloud reaches every Apple device the family owns, which is the Google rung's "subscribe once on desktop, it propagates" behaviour.

Caveat: the same article warns "**Make sure that you trust the source of your calendar**", and iOS offers *Unsubscribe and Report Junk* — so a low-quality feed has a user-visible complaint path. Not a technical blocker, but it means the feed must be well-formed.

### 2.2 Refresh behaviour

| Fact | Source |
|---|---|
| Manual refresh, all calendars: *View* → *Refresh Calendars* | <https://support.apple.com/guide/calendar/refresh-calendars-icl1024/mac> |
| Automatic refresh exists and is per-calendar: "Subscribed calendars can be refreshed automatically" → control-click the calendar → *Get Info* → **"Auto-refresh"** pop-up menu → "choose an option" | same |
| **The option values are not enumerated in Apple's doc** | **UNVERIFIED** — what intervals a user can pick |
| A subscribed calendar is marked by a distinct **Subscription** button next to its name | icl1024 |
| Failure surfacing: a warning symbol means "Calendar is **unable to connect** to the calendar account" | icl1024 |
| **Published fetch cadence** | **UNVERIFIED — Apple publishes none.** No number in any Apple source. |

**Design consequence:** with no published cadence, assume **≥24 h staleness** (the same assumption the Google rung makes against Google's last-official 24 h figure) and never promise same-day. Do not rely on conditional requests: **UNVERIFIED** whether Apple's fetcher honours `ETag`/`Last-Modified`, so serve the full body with `Cache-Control: no-cache, must-revalidate`.

### 2.3 Deletions, and the URL as a secret

- **Deletions:** **UNVERIFIED** whether Apple honours `STATUS:CANCELLED` on a subscribed feed. RFC 5545 §3.8.1.11 permits it. In practice the ambiguity is the same as Google's: simply omitting a deleted `VEVENT` is indistinguishable from truncation, so `STATUS:CANCELLED` on the same UID is the only spec-sanctioned signal. **This repo currently makes it moot**: the importer *skips* `STATUS:CANCELLED` events (`src/lib/server/services/icsImportService.ts:186`), so nothing deletion-aware exists today on any provider.
- **Is the URL a secret?** Apple publishes no "secret address" concept for a subscribed feed (contrast Google's *"Secret address in iCal format … Only you should know the Secret Address"*). **UNVERIFIED** that Apple treats the subscription URL as sensitive. Treat it as a bearer credential anyway by design: a tokenised feed is unauthenticated, so anyone with the URL can read the family's week. Rotate on Claim, on family-membership change, and on request.

### 2.4 Repo gap for this route

Identical to the Google rung, and already documented there: the existing ICS endpoint is session-auth-gated (`src/routes/api/events/[id]/ics/+server.ts:23-25`) and sets `Content-Disposition: attachment` (`:84-88`). Apple's fetcher carries no session cookie and ignores disposition. A new anonymous, tokenised, family-scoped feed route is required. **Apple's feed route has one advantage over Google's: it can be pointed at iCloud, so the family sees it everywhere with no per-device setup** (§2.1).

---

## 3. EventKit (native only) — L, and out of scope for the web app

**What EventKit is.** *"The EventKit framework provides access to calendar and reminders data so people can create, retrieve, and edit calendar items in your app."* (<https://developer.apple.com/documentation/eventkit>). `EKEventStore`: *"An object that accesses a person's calendar events and reminders and supports the scheduling of new events."* (same page).

**It is a local framework, not a network API.** The decisive sentence (<https://developer.apple.com/documentation/eventkit/accessing-the-event-store>):
> "Your app must obtain permission from the person using the app before it can access the **calendar database**: your app must **never directly modify the calendar database on its own**."

It reads whatever the device's Calendar database holds — which iCloud, Google and Exchange adapters populate separately — and it never speaks to Apple's servers. So EventKit cannot be reached from the web app at all: it needs a native binary the user installed and launched.

**Consent model, and the limitation that matters most here:**

| Property | Fact | Source |
|---|---|---|
| Access levels | `requestFullAccessToEvents`, `requestWriteOnlyAccessToEvents`, `requestFullAccessToReminders` | accessing-the-event-store |
| **No read-only tier** | **"Your app can't request read-only access to either events or reminders. To read events or reminders from the event store, your app needs full access."** | same |
| Write-only behaviour | List-calendars returns "a single **virtual** calendar, that doesn't represent any real calendar"; event queries on it return nothing; created events go "to a calendar that's chosen by the person using your app" | same |
| iOS 17+ plist keys | `NSCalendarsFullAccessUsageDescription` or `NSCalendarsWriteOnlyAccessUsageDescription`; plus `NSRemindersFullAccessUsageDescription` for reminders | same |
| Old key fails closed | On iOS 17+, an app without the new keys, or with only the deprecated `NSCalendarsUsageDescription`, "iOS automatically **denies** any access request" | same |
| macOS | All sandboxed apps need the `com.apple.security.personal-information.calendars` entitlement | same |
| Change notification | "if a change to the Calendar database occurs from outside your app, EventKit detects the change and sends a notification" — usable for a sync trigger | eventkit framework page |
| `EventKitUI` shortcut | "EventKitUI presents chooser and editor UI outside of your app's process … The chooser and editor UI has **full access** to calendars on the device **regardless of the access granted to your app**" — create-an-event with no permission request at all | same |

**The killer for a sync feature: EventKit offers no read-only tier.** A mirror-into-our-app design would have to request **full read+write access to every calendar on the user's phone** — a far broader consent ask than a scoped Google OAuth token, and it lands on a user who is trying to grant calendar access, not address-book-plus-everything access. The `EventKitUI` create-only path is the only sensible EventKit use (and is what the repo's iOS alternative list already gestures at — `docs/plans/native-android-app-plan.md:386-394`).

### 3.1 Does EventKit even apply here? The repo's native plan is Android — **no**

`docs/plans/native-android-app-plan.md` is explicitly a **Kotlin/Android** plan (`:1-4`, `:11-18`) whose iOS discussion is a "what CANNOT be done" aside (`:386-394`) and a summary row reading *"iOS Similar | ❌ iOS restrictions | ✅ Share Sheet works"* (`:490`). **EventKit does not exist on Android**, so rung 5 is not an option for the planned app.

**Android's equivalent, and it is more capable — but has its own gate.** `CalendarContract` / Calendar Provider gives third-party apps direct read/write on the device's calendar tables:

> "The Calendar Provider is a repository for a user's calendar events. The Calendar Provider API allows you to perform query, insert, update, and delete operations on calendars, events, attendees, reminders, and so on." — <https://developer.android.com/identity/providers/calendar-provider>

**But a user toggle can silently black-hole it for Google data** (<https://support.google.com/calendar/answer/16089827>):
> "The 'Share Google Calendar data with other apps' setting controls whether your Calendar data is **accessible via Calendar Provider** to apps you granted Calendar permission to."
> "**Third-party calendar apps:** Other apps might not show or notify you about your Calendar events."
> "**Certain Android system features:** For example, a feature on Android that automatically turns on 'Do not disturb' mode during a meeting is affected."

So an Android app can hold a runtime `READ_CALENDAR`/`WRITE_CALENDAR` grant and still see **nothing**, with the Calendar app popping a notification about the setting. **This is a stronger and less obvious blocker than iOS's full-access prompt, and it applies to the repo's actual planned platform.** (Whether it also affects non-Google CalDAV accounts on Android is **UNVERIFIED** — the doc speaks only of "your Google Calendar data".)

**Verdict on rung 5: do not build it as part of calendar sync.** It is a native-app feature, on a platform the repo has not chosen to target for calendar, with a consent model worse than a tokenised feed and a platform-level data-access switch that can void it.

---

## 4. Server-side helper libraries

Live query of the npm registry, the npm downloads API, and the GitHub API, **2026-09-30** (downloads window 2026-09-23..2026-09-29).

| Package | Latest | Published | Downloads/wk | Downloads/mo | License | Last repo push | iCloud listed? | Verdict |
|---|---|---|---|---|---|---|---|---|
| `ts-caldav` | 0.4.3 | **2026-09-29** | 1,085 | 3,719 | MIT | 2026-09-29 | **yes** | **The only viable CalDAV client.** Actively maintained, but ~1k/wk — effectively unproven at scale. |
| `dav` | 1.8.0 | **2018-08-11** | 1,996 | 7,696 | MPL-2.0 | 2021-05-31 | no | **Abandoned for publishing (8 years).** 315 stars, **54 open issues**. Do not adopt. |
| `node-caldav` | 0.0.1 | **2014-06-20** | **1** | 14 | MIT | 2014-12-15 | no | **Dead.** Last publish 12 years ago, 1 download/week, README is 12 lines of `Work-in-Progress`. Do not adopt. |
| `ical.js` | 2.2.1 | 2025-08-08 | 977,780 | — | MPL-2.0 | 2026-09-28 | n/a | Reference iCalendar impl; full RRULE parse/serialize; UID first-class. |
| `ical-generator` | 11.1.2 | **2026-09-28** | 728,798 | — | MIT | **2026-09-30** | n/a | Generation counterpart to `ical.js`; the most actively developed dep here. |
| `rrule` | 2.8.1 | 2023-11-10 | 3,404,920 | — | BSD-3-Clause | 2024-06-27 | n/a | The RRULE engine `ical-generator` builds on. Dormant ~2y, stable, huge install base. |
| `node-ical` | 0.27.2 | **2026-09-13** | 402,514 | — | Apache-2.0 | 2026-09-13 | n/a | Node-only parser. README: "robust recurrence rule (RRULE) expansion, timezone-aware date handling, exception dates (**EXDATE**), and recurrence overrides (**RECURRENCE-ID**)". Actively maintained. |

**Repo already depends on: none of them.** `package.json:90-115` has no CalDAV client and no iCalendar library. A grep across `src/**/*.ts` / `src/**/*.svelte` for `caldav|ical\.js|ical-generator|node-ical|rrule` hits only the app's own hand-rolled files (`src/lib/utils/ics.ts`, `src/lib/server/services/icsImportService.ts`, `eventRecurrence.ts`, `recurrenceService.ts`, `icsImportPreview.ts`, `ics.test.ts`, and the export route). Everything ICS is hand-rolled. **Same starting position as the Google rung** — which is good news: one shared substrate serves all providers.

**Basic auth with an app-specific password:** yes, natively. `ts-caldav` — `auth: { type: "basic", username, password }` (btoa over global `fetch`), README "Auth Notes": *"Basic Auth & OAuth2 supported / Works with Google, iCloud, Fastmail, Nextcloud, Radicale"*. It also runs where the repo runs: *"bundles no HTTP-client dependency — it uses the runtime's built-in web APIs (`fetch`, `AbortController`, `URL`, `btoa`) … **Node.js 18+** … **Vercel Edge**."*

**`ts-caldav` limitations, verbatim** — these decide whether it can carry this repo's model:

> - "No WebDAV sync-token support yet; synchronization currently uses `getctag` plus ETag diffing."
> - "Component support is currently focused on `VEVENT` and `VTODO`."
> - "Occurrence edits apply to a single occurrence (`"this"`) or drop the tail of a series (`"thisAndFuture"`). **Changing an occurrence *and every later one* is not supported yet** — split the series manually by truncating it and creating a new event for the remainder."
> - "**Recurrence rules are not expanded locally**; use `expand` to have the server return individual occurrences."

The last bullet is the important one: **`ts-caldav` wants the *server* to expand, this repo wants to expand *itself* at read time** (`CONTEXT.md:32-34`). They are opposites. The `getctag`+ETag model is also weaker than RFC 6578 sync-token, though fine at family scale.

### 4.1 What the hand-rolled layer already proves

Unchanged from the Google rung's audit — Apple adds no new requirement, because rungs 1–4 all carry the same bytes.

| Concern | Status | Evidence |
|---|---|---|
| **UID scheme out** | `UID:<eventId>@familyplanz.com`, `ICS_DOMAIN = 'familyplanz.com'` | `src/lib/utils/ics.ts:14`, `ics.ts:109` |
| UID **in** | **Not captured** — `IcsEventDraft` has no `uid` field, so inbound identity is discarded and no round-trip is possible today | `src/lib/server/services/icsImportService.ts:5-17` |
| **RRULE out** | `FREQ` + `INTERVAL` (omitted when 1) + `BYDAY` + `UNTIL` xor `COUNT`; only daily/weekly/monthly/yearly, else `null` | `ics.ts:69-91`, `ics.ts:135-136` |
| **RRULE in** | Same five parts; ordinal-stripped `BYDAY`, and a non-plain-weekday `BYDAY` is dropped to `null` rather than mis-filtered | `icsImportService.ts:224-258`, esp. `:238-245` |
| **Exception Override → ICS** | **Malformed.** A scope-'this' exception is emitted as a plain VEVENT reusing the **master's** `id` (hence master's UID) with `recurrence: null` — no `RECURRENCE-ID`, no `SEQUENCE` | `src/routes/api/events/[id]/ics/+server.ts:64-81`; `ics.ts:105-140` |
| **Time zones** | Always UTC `Z`; **no `VTIMEZONE`**, no `TZID`. Documented: "recurring wall-times can drift across DST for non-UTC users" | `ics.ts:6-12`, `ics.ts:53-56`; `buildIcsCalendar` emits only `VERSION` + `CALSCALE` (`ics.ts:143-148`) |
| Deletions | `STATUS:CANCELLED` **skipped** on import | `icsImportService.ts:186` |
| `PRODID` / `METHOD` | Neither emitted (`BEGIN:VCALENDAR` / `VERSION:2.0` / `CALSCALE:GREGORIAN` only) | `ics.ts:143-148` |
| Write-shape normalizer | One home for the 5 recurrence fields, shared by create/edit/import | `src/lib/server/services/eventRecurrence.ts:1-30` |
| Feed scale cap | `MAX_EVENTS = 500` on import | `icsImportService.ts:19` |
| Feed headers | Only `Content-Type` + `Content-Disposition` — no `ETag`/`Last-Modified`/`Cache-Control` | `src/routes/api/events/[id]/ics/+server.ts:84-88` |

**Apple-specific twist worth flagging:** the missing `RECURRENCE-ID` is *more* damaging here than on the Google rung. Google's importer can recover identity from `iCalUID`; Apple's subscribed-calendar ingestion has **no Apple-published identity signal at all**, and the CalDAV route depends on UID+RECURRENCE-ID being correct in the bytes we write. One shared fix, three providers.

---

## 5. iCloud's other calendar-adjacent surfaces — **no**

| Candidate | Verdict | Basis |
|---|---|---|
| **Apple Calendar Server API** (the internal service Calendar.app talks to) | **Not available to developers.** No Apple developer documentation exists for it; the name appears only in third-party protocol analysis. **UNVERIFIED** that this is even an official Apple name. | absence across developer.apple.com |
| **Shortcuts automation** | **Not a server surface.** Shortcuts run on the user's device; a third-party web server cannot invoke one. Apple's own repo plan lists "Siri Shortcuts integration" as an iOS *user-facing* alternative (`docs/plans/native-android-app-plan.md:393`), not an integration point. | architectural exclusion; **UNVERIFIED** from an Apple Shortcuts primary source (not fetched) |
| **Apple Business Manager** | Device/identity/assignment management for fleets. **No calendar surface documented** — absence, flagged **UNVERIFIED** rather than asserted. | absence |
| **"Calendar Sharing Invitation" API** | **Does not exist as an API.** iCloud calendar *sharing* is real and peer-to-peer: choose *Allow editing* ("create, edit, and delete events, and track invitation responses") or *Read-Only* (<https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a9479/icloud>). But it is a feature between two Apple Accounts inside iCloud, with no documented third-party programmatic surface. | icloud share-a-calendar |
| **`Account Data Sharing` (account.apple.com)** | **This is the closest sanctioned thing** — real, user-visible, revocable, and explicitly covers iCloud Calendar. But it is the *consumer side* of the 121539 flow; the *provider side* is unpublished. See §0. | 121539 |
| **CloudKit** | Apple's sync framework, but for *your app's own* container — not a read/write surface onto the user's iCloud Calendar database. | <https://developer.apple.com/icloud> |

**Answer: no.** There is no sanctioned Apple API for a third-party *server* to sync an iCloud calendar. The only candidates are the gated "supported third-party app" authorization (unpublished process) and the grey-area CalDAV + app-specific-password route.

---

## 6. Fit against this repo's domain

### (a) Recurring Event → iCloud is the **easiest** provider fit of the three

CONTEXT.md:32-34 defines a **Recurring Event** as one that "regenerates occurrences on a fixed schedule (frequency + interval), **expanded virtually at read time**". That is *literally* the CalDAV/iCalendar data model, and it is a better match than either rival.

| | Family Planz | iCloud via CalDAV | iCloud via subscribed feed | Google (for contrast) |
|---|---|---|---|---|
| Rows on the wire | 1 | 1 `VEVENT` + 1 `RRULE` | 1 `VEVENT` + 1 `RRULE` | 1 master, then a **separate `events.instances` call** |
| Occurrence expansion | computed at read time | computed by Apple | computed by Apple | computed by the API, on request |
| Identity across occurrences | one `id` | one `UID` + `RECURRENCE-ID` per override | one `UID` | `id` **changes per occurrence**; `iCalUID` shared |
| Query cost for a month | free | one `calendar-query` with a `time-range` | feed fetch | N+1 without `singleEvents`; row explosion with it |

Three concrete wins on Apple:
1. **No `singleEvents` trap.** The Google rung's worst cost is that `singleEvents=true` turns one daily series into ~365 rows against a 2500-row page cap. CalDAV just stores the `RRULE`; a `calendar-query` `time-range` filter does the narrowing. Google's doc even concedes CalDAV is the better-shaped protocol, just OAuth-gated there (<https://developers.google.com/calendar/caldav/v2/guide>).
2. **Identity is correct by construction.** RFC 5545 §3.8.4.4 `RECURRENCE-ID` — "used in conjunction with the 'UID' and 'SEQUENCE' properties to identify a specific instance of a recurring 'VEVENT'" — maps 1:1 onto **Exception Override** (CONTEXT.md:36-38, "a user edit to a single occurrence … stored separately without altering the schedule"). This is a *more* faithful mapping than Google's per-occurrence `id`.
3. **No sensitive-scope regime.** Apple has no verification, no brand check, no demo video — so the *non-legal* friction is near zero. That is Apple's only real advantage, and it is a large one.

**The catch is DST, and on Apple it is worse than on Google.** The writer emits UTC `Z` only, no `VTIMEZONE`/`TZID` (`ics.ts:6-12`, `ics.ts:53-56`, `ics.ts:143-148`). On the Google rung a Calendar API write lets Google hold the series in the calendar's own `timeZone`. **That escape does not exist here: with CalDAV and with a subscribed feed, the bytes are ours**, so a recurring wall-time will drift an hour twice a year on every Apple device, permanently. **Fixing `VTIMEZONE`/`TZID` is a repo-side prerequisite for *both* Apple routes — it is not something the provider can rescue.**

**Second catch: Apple publishes no capability discovery.** There is no Apple page stating which RFC 4791 reports it supports, whether `REPORT` free-busy works, whether shared calendars are exposed. Google's CalDAV guide enumerates support and gaps report by report; Apple's equivalent is silence. **Every CalDAV capability question must be answered by experiment, not documentation.**

### (b) Recurring Tasks and Recurring Bills cannot sync to a calendar

Identical to the Google rung's conclusion, and the reason is domain, not provider.

**Recurring Task** (CONTEXT.md:62-64): "Exactly one live occurrence exists at a time — the cursor. Completing snaps the next one to today + n×interval… **One row per task — no occurrence expansion.**" **Recurring Bill** (CONTEXT.md:66-68): "its dueDate doubles as the cursor… **One row per bill** … never as materialized occurrences."

There is no RRULE here, and there cannot be: the next value is a function of **user action** (complete / mark paid) and the anchor, not of a calendar date. Emitting occurrences would require materializing N future rows the domain explicitly forbids, and every advance would mean deleting and re-writing them.

**Apple-specific angle:** `VTODO` (RFC 5545 §3.6.2) is the *natural* iCalendar home for a Recurring Task — complete, cancellable, has a due date — and `ts-caldav` explicitly supports it. **Two reasons it still does not help:** (1) whether iCloud exposes a Reminders/`VTODO` collection over CalDAV to third parties is **UNVERIFIED** and doubtful given Apple's product split; (2) even if it did, a **cursor is not a `VTODO`** — the cursor advances on completion, which in `VTODO` terms is a `STATUS` change on one item, not a schedule. You'd be writing a single todo and rewriting it forever.

**Recommendation (unchanged from Google): exclude Tasks and Bills from every Apple integration. Sync Events only.** If a bill date must reach a phone, project the *current* cursor due date as one all-day event and rewrite on each advance — a projection, not a sync, and see (d) for why it is also the wrong home for money.

### (c) Anonymous Account / Claiming — three of five rungs are post-Claiming-only

CONTEXT.md:9-11: an **Anonymous Account** is "created silently on first visit, **with no email attached**. Full app access, **no sync**." **Claiming** (`:13-15`) attaches a verified email "making its data syncable across devices." Unclaimed accounts are deleted after the 90-day **Inactivity Window** (`:26-28`) and are "warned their data cannot sync without Claiming" (`:159`).

| Route | Anonymous Account | Claimed account | Why |
|---|---|---|---|
| 1 — subscribed ICS feed | **Works.** No Apple Account involved anywhere. The URL is opaque and self-contained. | Works | Apple's fetcher needs no identity, and (bonus) the user can file it in iCloud to reach all devices (§2.1) |
| 2 — "supported app" OAuth | **Impossible** | Unknown — gated | An Apple Account is the consenting identity; an unclaimed user has no email to correlate it to |
| 3/4 — CalDAV | **Impossible** | Possible, ToS-grey | Requires an Apple Account **with 2FA and a trusted device** — i.e. already a committed Apple user with a verified email |
| 5 — EventKit | **Impossible** | Native only | Requires an installed native binary; irrelevant to a web-only Anonymous Account |

**Same shape as the Google ladder — rung 1 works pre-Claiming, everything else is post-Claiming-only — but Apple makes the point sharper.** The CalDAV credential cannot be created without 2FA **and a trusted device** (iCloud Terms §I defines the trusted-device requirement; 102654 requires 2FA). So the *only* people who can use rung 3 or 4 are people who already own an iPhone or Mac — i.e. **exactly the people rung 1 already serves for free, better, with no credential, no ToS exposure, and no ToS-grey storage of their Apple Account password.** There is no Apple-specific population for whom CalDAV is the right answer. This is the single strongest reason to build only rung 1 on Apple.

**Also:** Claim Conflict (CONTEXT.md:21-22, `:158`, `:169-170`) — an Apple credential is a per-user secret and must ride the user's id, never be merged silently across a conflict merge. Same rule as the Google connection.

### (d) Privacy posture — the Apple credential is the most sensitive thing this app would ever hold

**The repo's stance is absolute.** CONTEXT.md:146-148: a **Receipt** is "PROCESSED AND DELETED: parsed on-device into text and numbers, **never uploaded or stored**. Only the parsed fields and Line Items persist." CONTEXT.md:164 restates it: "A **Receipt** produces **Line Items** and is then discarded — **no image bytes persist anywhere**." The **OCR Chain** (`:150-152`) is on-device-first, with cloud as an explicit, opt-in, per-scan, server-gated last resort.

**Say the uncomfortable thing plainly: an Apple Account email + app-specific password is the most sensitive credential this app would ever hold — more sensitive than a Google OAuth token, and in a different category from anything else in the system.**

| | Google OAuth token (rungs 2–3, Google doc) | Apple app-specific password (rungs 3–4) |
|---|---|---|
| Scope | Explicit, enumerated, minimal (`calendar.events.readonly`) | **None.** One bearer string that authenticates Mail, Contacts **and** Calendar (§0/121539 bundles all three) |
| Revocation granularity | Revoke in Google's account UI; token stops working | Revoke the password → **the app loses iCloud access entirely**; no per-resource unlink (102654) |
| Auditability | Every access logged in Google account security | No log visible to the user or to us |
| Expiry | Refresh tokens persist until revoked | **"all of your app-specific passwords are revoked automatically"** on any Apple Account password change (102654) — a user resetting their password silently breaks sync |
| What it can reach beyond calendar | Calendar only, as scoped | Whole-account surface; a breach is an Apple Account compromise, not a calendar compromise |
| Regulatory/verification regime | Documented sensitive-scope verification, demo video, brand check | **None** — Apple's silence is not permission |
| ToS posture | Documented, sanctioned | **Grey.** iCloud Terms §V.10 names "accessing the Service through any automated means" (§1.6) |

An app-specific password is, functionally, a **shared account password for the user's entire iCloud account**, held in our Postgres, in a Vercel serverless function, reachable by anyone with DB access — for the privilege of showing a family their week on a phone that already has it.

**Position to take, plainly:**
1. **The feed route does not touch this.** Rung 1 stores no Apple credential of any kind. It moves family events *to the user's own device* rather than pulling their identity *to our server*. Under the Receipt stance that is the same shape as on-device OCR: nothing sensitive lands in our infrastructure.
2. **Never store an Apple Account credential.** Not the app-specific password, not the main password, not a 2FA code. If rungs 3–4 are ever taken: opt-in only, post-Claiming only, encrypted at rest, never logged, never in a URL, with a one-tap "disconnect Apple" that **deletes the row** rather than disabling it.
3. **Do not ship rungs 3–4 as a default, and do not build them for Anonymous Accounts** — they are structurally post-Claiming.
4. **Scope-narrow regardless.** Never emit Receipt-derived **Line Items** or Spend Detail into any calendar description or location; never include **Private Tasks** (CONTEXT.md:50). Family events carry kids' schedules, school, medical appointments and locations — a real privacy surface even without a credential.
5. **Re-assert the routing rationale out loud, because it is easy to get backwards:** Apple is the provider where giving us access buys us the *least* trust, because there is no scope model to narrow it with. Feed-only is not a shortcut here; it is the correct answer.

---

## Tagged backlog

- `[calendar-sync][apple]` **Build rung 1 only.** One new `GET /feed/[token].ics` route, shared across Google + Apple + Outlook, anonymous, tokenised, family-scoped
- `[calendar-sync][apple][recurring-events]` **Emit `RECURRENCE-ID` + `SEQUENCE` for Exception Override, and `STATUS:CANCELLED` for cancelled occurrences** — required before any exception-bearing feed is correct, and *more* urgent on Apple (no provider-side identity signal to recover from)
- `[calendar-sync][apple][recurring-events]` **Add `VTIMEZONE` + `TZID`; stop exporting recurrence as fixed UTC wall-time** — on Apple this is *not* fixable provider-side, unlike the Google rung
- `[calendar-sync][apple]` Add `PRODID` (RFC 5545 requires it on `VCALENDAR`) and `Cache-Control: no-cache`; `ics.ts:143-148` emits neither
- `[calendar-sync][apple][onboarding]` Copy must instruct the **iCloud** account option when subscribing (iOS 26: "Next to Account, choose iCloud"; macOS: "Next to Location, choose iCloud") — that is what makes one subscription reach every device (support.apple.com/en-us/102301)
- `[calendar-sync][apple][retention]` **Rung 1 is the only Apple route that works pre-Claiming.** Say so in onboarding copy; mirror the Google rung's anonymous-first argument
- `[calendar-sync][privacy][apple]` Never store an Apple Account email or app-specific password. If rungs 3–4 are ever approved: post-Claiming, opt-in, encrypted at rest, disconnect = row deletion
- `[calendar-sync][apple][recurring-events]` Surface the trade explicitly in copy: Recurring Tasks/Bills are cursor rows and will not sync — same statement as the Google rung
- `[calendar-sync][apple]` Re-check the **"supported third-party apps"** authorization (<https://support.apple.com/en-us/121539>) annually for a published enrollment process. If it opens, it supersedes rungs 3–4 and retires blocker (1) entirely
- `[calendar-sync][apple]` Do **not** adopt `dav` (last publish 2018-08-11, 54 open issues) or `node-caldav` (last publish 2014-06-20, ~1 dl/wk). `ts-caldav` is the only live CalDAV client and names iCloud explicitly — but budget for it being ~1k installs/week
- `[calendar-sync][native]` Do not plan EventKit for this repo: the native plan is Android (`docs/plans/native-android-app-plan.md:11-18`), EventKit is iOS-only, and Android's Calendar Provider can be silently emptied by the user's "Share Google Calendar data with other apps" toggle (support.google.com/calendar/answer/16089827)
- `[calendar-sync][apple]` **Record the CalDAV capability matrix empirically** before estimating rungs 3–4: Apple documents no RFC 4791 support profile, no discovery path, no rate limits, no `VTODO` surface. Every operational number will have to be measured, not cited

## Assumptions (flag for correction)

- "Apple sync" means **iCloud Calendar** (Apple Account calendar synced via iCloud), not an arbitrary CalDAV server. The iOS/Mac clients will happily accept third-party CalDAV, but that is the user's own server, not Apple's.
- Apple's "supported third-party apps" authorization (121539) will **not** open to self-serve enrollment on a useful timeline. If it does, rungs 2–4 collapse and the whole ladder shortens.
- The repo stays on Vercel serverless. A headless CalDAV poller on Hobby-tier cron (1/day) would be technically fine for `getctag` diffing — **the ToS question, not the infrastructure, is what rules it out.**
- "Sync" for Apple = **Events only**; Tasks and Bills excluded per §6(b), consistent with the Google and Outlook notes.
- Feasibility facts were read from Apple's live documentation on 2026-09-30; the 121539 and 102301 pages carry *Published Date* 2025-10-07 and 2025-10-08 respectively, and 102301 carries 2026-05-22. Re-verify before acting, as Apple edits these pages in place.
