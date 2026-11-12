# sponsored

**domain** — Sponsored Events: the serve gate, the month's ads on the calendar, the consent trail beside it, and ad-row retention.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns: the **Sponsored Event** decision — whether a user sees ads at all (`userSettings.showAdsAsEvents`, #088); the month's Sponsored Events (a user's own 📢 rows, or three generated ones); the consent trail (`adConsentRecords`) that records that decision's history; ad-row retention (`adEvents`).
- Does not own: the settings row itself (`identity` writes it; this module only reads the one field), the Event row (`calendar` owns `events`; this module reads the user's own rows for the month), the chip/legend look (`calendarPage` renders it from the row's `isAd` + amber), the opt-in checkbox and its consent-history display (the `account` screen).
- The one surface invariant this module is responsible for: every row it returns is marked `isAd: true` and amber, so no consumer can render a Sponsored Event unlabelled (`CONTEXT.md:40-42`).

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: the gate rule, the amber, contract types. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: the month read, the consent read/write, retention. | — |
| [ui/index.ts](ui/index.ts) | entry | Public components. Empty on purpose — see Public interface. | — |
| [sponsored.http.db.test.ts](sponsored.http.db.test.ts) | test | Golden contract of `GET /api/sponsored-events` against today's legacy handler (S2); must stay unchanged after the port. | itself |

## Public interface

Designed small and deep: a handful of exports carry the whole behaviour, and each survives the deletion test.

### `index.ts` (isomorphic)

- `shouldServeSponsoredEvents(settings)` — the ONE serve gate: `showAdsAsEvents === true`; no settings row, `null` and `false` all mean no Sponsored Events, and no other field can grant consent. Deletion test: inlining the comparison moves the one rule every ad surface depends on into each caller — the exact drift #088 exists to prevent; `calendarPage` also needs the same answer for its legend row, so it is a real interface, not a pass-through.
- `SPONSORED_EVENT_COLOR` — `#f59e0b`, the wire amber. Deletion test: the literal would otherwise live in the wire projection and in the chip recipe; #067 is the incident where those two drifted.
- Types: `SponsoredEvent` (the row the wire and the calendar render), `SponsoredConsentDecision`, `SponsoredEventsQuery`, `SponsoredEventsResponse` — the module's vocabulary, re-exported from the contract so callers never hand-mirror a wire shape.
- No client api (`sponsored.api.ts`): nothing in the browser fetches the route — the calendar gets its rows in the page load and Android is the only wire client. Adding one would be a pass-through.

### `index.server.ts`

- `listSponsoredEvents(ctx, actor, { month? })` — the month's Sponsored Events. Checks the gate FIRST (no ad query when off), resolves the user's zone from identity settings, resolves the month (`YYYY-MM`, or the current month in that zone), and returns rows already carrying `isAd: true`, amber, `allDay: true` and no calendar. Serves `GET /api/sponsored-events` and `calendarPage`'s ad leg. Deletion test: the gate, the zone window, the generation and the projection would each move into both callers.
- `recordSponsoredConsentChange(ctx, actor, { previous, next })` — appends one record on a real transition only (`granted` / `withdrawn`), returns the decision or `null`. Deletion test: the transition rule is the whole point of the trail; a caller-side compare would fabricate "declined" rows for users who never touched the setting.
- `listSponsoredConsentHistory(ctx, actor)` — the user's whole trail, newest first. Deletion test: the read also promises "writes nothing"; a hand-written select forgets the order and invites a serve-log, which is what this table is deliberately not.
- `pruneSponsoredEventsOlderThan(ctx, cutoff)` — retention: deletes ad rows created before the cutoff, returns the count. Called by `app`'s weekly cron. Deletion test: the anchor (`createdAt`, not `scheduledFor`) is the rule.
- `listSponsoredEventsEndpoint` — the `GET /api/sponsored-events` handler (auth, month parsing, body). `+server.ts` stays wiring only.
- Deliberately absent: an engagement write (`trackAdImpression`/`trackAdClick` in legacy) and a target-plan reporting read. Neither is on the wire, neither has a consumer, and `adEvents` has no writer in v2 — they die with `injectAdEvent` and a future ad-inventory ticket designs them together (see the sheet Notes). The `adEvents` columns and the prune stay.

### `ui/index.ts`

Empty on purpose. Every sponsored surface is a screen's: the account checkbox and consent history (`account`), the chip word "Ad" / accessible name "Sponsored", the legend and the ad-less event modal (`calendarPage`). The dashboard's glance card keys on the same `isAd` flag if it is ever handed a sponsored row (today its loader passes calendar events only). Moving one here would split a visual recipe across two modules; this module's contribution is the `isAd` flag and the amber those surfaces key on.

## How to test

- Whole module: `npm run test:mod -- sponsored` (add `--legacy` while the legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup.
- Database + services: `*.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: `sponsored.http.db.test.ts` pins status + full body of `GET /api/sponsored-events` (golden tests, committed mode, `beforeEach(truncateAll)`). It is written against the legacy handler and must be green before the port (S2 check) and unchanged after it.
- Fixtures: `sponsored.fixtures.server.ts` (settings row for the gate, a user-owned 📢 Event, an `adEvents` row, a consent record).
- UI: no components here; the chip and legend are the calendar's tests, the checkbox the account's.

## Invariants

Each line is a behaviour the port must keep, with the legacy evidence and the test that pins it.

- The only serve gate is `userSettings.showAdsAsEvents === true`: a missing row, a `null` flag and a `false` flag all mean no Sponsored Events, and no other field on the row can grant consent — `src/lib/server/services/adService.ts:77-82`, `src/lib/server/services/calendarData.ts:84`. Pinned by `sponsored.http.db.test.ts` › "generates three Sponsored Events when the month has none", "withholds ads when the user has no settings row, even with 📢 rows in the month", "withholds ads when showAdsAsEvents is false", "withholds ads when showAdsAsEvents is null"; and `sponsored.serve.rules.test.ts` (the one-row table, S3).
- Consent records are evidence, never permission: nothing on the serve path reads `adConsentRecords`, and a serve read writes no record — `src/lib/server/services/adConsentService.ts:5-19`, `src/lib/server/db/schema.ts:917-933`. Pinned by `sponsored.http.db.test.ts` › "treats a consent record as evidence, never permission, and writes none on a read".
- A consent record is appended only on a real transition: not-granted → true records `granted`, true → false records `withdrawn`, and an unchanged value (or a never-touched user saving with ads off) records nothing — `src/lib/server/services/adConsentService.ts:21-36`. Pinned by `sponsored.consent.rules.test.ts` (the four-row decision table, S3) and `sponsored.service.db.test.ts` › "appends only on a transition".
- Records are append-only and read newest-first; a read never writes — `src/lib/server/services/adConsentService.ts:45-65`. Pinned by `sponsored.service.db.test.ts` › "keeps the whole trail newest first" and "a read writes nothing".
- A Sponsored Event month is a window in the user's zone: `startOf('month')` → `+1 month`, matched against `events.start` (the stored instant) — `src/lib/server/services/adService.ts:93-95,104-105`, `src/routes/api/sponsored-events/+server.ts:18`. Pinned by `sponsored.http.db.test.ts` › "windows the month in the user's zone, not UTC".
- An omitted `month` is the current month in the user's zone (settings zone, else UTC) — `src/routes/api/sponsored-events/+server.ts:17-27`. Pinned by `sponsored.http.db.test.ts` › "uses the current month in the user zone when month is absent".
- `month` is strict when present: `2026-13`, `2026-00`, `2026-1`, `nov`, `2026-11-01` and an empty value are all `400 {"error":"Invalid month"}` — `src/routes/api/sponsored-events/+server.ts:19-30`. Pinned by `sponsored.http.db.test.ts` › "answers 400 {"error":"Invalid month"} for month=…".
- The wire is `200 {"events": [<calendar display row> & {"isAd": true, "color": "#f59e0b"}]}`, `200 {"events": []}` when the gate is off, and `401 {"error":"Unauthorized"}` when signed out — `src/routes/api/sponsored-events/+server.ts:13-35`, `docs/guides/task-api-spec.md:531-539`. Pinned by the full-body and 401 goldens in `sponsored.http.db.test.ts`.
- A row is recognised as a Sponsored Event when the user owns it and its title starts with `📢`; the served title is `📢 ` + the title without the marker, trimmed, and the row is listed in start order — `src/lib/server/services/adService.ts:97-123`. Pinned by `sponsored.http.db.test.ts` › "serves any own event whose title starts with 📢, trimmed, and nothing else" and "lists the month's ad rows in start order". (Probable accident — owner question in the sheet.)
- When the month has no Sponsored Event row, the module generates exactly three, at 10:00 in the user's zone on a day of that month, drawing templates without repeats while templates remain — `src/lib/server/services/adService.ts:126-183`. Pinned by `sponsored.http.db.test.ts` › "generates three Sponsored Events when the month has none"; the exact template/day table is `sponsored.month.rules.test.ts` (S3).
- The display projection is fixed: `title` `📢 <message>`, `allDay: true`, `calendarId: ''`, `end` equal to `start`, amber `#f59e0b`, and `isAd: true` on every row — `src/lib/server/services/adService.ts:294-334`, `src/lib/server/services/calendarData.ts:60`, `src/routes/api/sponsored-events/+server.ts:35`. Pinned by the full-body golden and the generated-row shape assertions.
- A Sponsored Event has no calendar, so no person can be attributed to it and no person filter can hide it — `src/lib/utils/calendarAssignees.ts:90-91,132`. Pinned on the wire by the golden (`calendarId: ''`) and by the calendar's assignee-filter test (`calendarPage`).
- Sponsored Events are always labelled: the row carries `isAd`, and the calendar chip wears the word "Ad" and the accessible name "Sponsored" over a neutral hatch — `src/lib/utils/chipVocabulary.ts:135,145-146,157`, `src/lib/components/calendar/CalendarKey.svelte:52-53,105`. Pinned on the wire by the golden (`isAd: true` on every row) and by the calendar's chip test + visual check.
- An ad offers no export/menu actions: the event modal and its header hide them when `isAd` — `src/lib/components/calendar/EventModalHeader.svelte:42`, `src/lib/components/calendar/EventModal.svelte:405`. Pinned by the calendar's `EventModal` tests + visual check.
- Ad events are pruned weekly at 90 days, anchored on `adEvents.createdAt`, and the count removed is returned — `src/lib/server/db/actions/adEvents.ts:19-26`, `src/routes/api/cron/cleanup/+server.ts:18,46-48`, `vercel.json:5`. Pinned by `sponsored.service.db.test.ts` › "deletes ad rows created before the cutoff and returns the count" and `sponsored.repo.db.test.ts` › "keeps rows created at or after the cutoff".

## Depends on

- May import: kernel + identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse (public entries only).
- Owns tables: `adEvents`, `adConsentRecords`.
- Reads (join only): `events` — a user's own 📢 rows for the month (`calendar`'s table). Needs a `FOREIGN_READS` entry in `scripts/arch/registry.mjs` at S4 with the reason "serve the 📢 rows a user already owns".
- Calls: `identity` — `getUserSettings` (the gate's one field and the zone). That is the whole dependency: the month read never touches another module's service.
- Called by: `calendarPage` (its ad leg: `listSponsoredEvents` for the visible month, `shouldServeSponsoredEvents` for the legend; the chip, legend and event-modal surfaces all key on `isAd`), the `account` screen (the opt-in checkbox and the consent-history list), `identity`'s `GET`/`PATCH /api/me/settings` (consent history read + transition write, through the `CalendarSettingsConsentPort` identity declares in its own `index.ts` — this module satisfies it structurally, so identity never imports sponsored), and `app`'s cleanup cron (`pruneSponsoredEventsOlderThan` at 90 days).
