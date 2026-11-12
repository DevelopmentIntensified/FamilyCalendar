# Port sheet: sponsored

**domain** · rank 12 · port #12 · home: `src/lib/domains/sponsored/` · README after the port: `src/lib/domains/sponsored/README.md` (written in S1)

Sponsored Events: serve gate (showAdsAsEvents), month generation, impressions/clicks, consent records, blob assets.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse.
- **Owns tables:** `adEvents`, `adConsentRecords`.
- **Must be ported first:** identity (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `c37f078`
- [ ] S3 contract + rules
- [ ] S4 repo (+ fixtures)
- [ ] S5 service
- [ ] S6 http + route wiring (goldens unchanged since S2)
- [ ] S7 UI rebuild (rules, api, state, components, screen) + visual check
- [ ] S8 rewire importers, delete legacy code and legacy tests
- [ ] S9 README final, census --write, gate:push, ledger done

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- The only serve gate is `userSettings.showAdsAsEvents` (#088); consent records are evidence, never permission.
- Sponsored Events are always labelled on every surface.
- Ad events pruned after 90 days.
- `GET /api/sponsored-events?month=YYYY-MM` shape (Android).

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface

| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/sponsored-events` | GET | signed-in via `requireUserJson` (401 `{"error":"Unauthorized"}`) | `?month=YYYY-MM` optional; absent = the current month in the user's zone (zone from settings, else `UTC`); when present it must match `^(\d{4})-(\d{2})$` with month 1–12; no body | 200 `{events: [...]}` — each row is the calendar-display shape plus `isAd: true` and `color: '#f59e0b'`; `{events: []}` when the serve gate is off | 400 `Invalid month` | `src/routes/api/sponsored-events/+server.ts:13-35`; `src/lib/server/utils/requireUser.ts:48-53` |

### Rules the module must keep

- The ONLY serve gate is `userSettings.showAdsAsEvents === true`: a missing settings row, a null flag or a false flag means no Sponsored Events, and no other field on the row can grant consent — `src/lib/server/services/adService.ts:77-82` · test: `src/lib/server/services/adService.test.ts` › "serves ads when, and only when, the one field is true", "withholds ads when the user has no settings row at all", "ignores every other field on the settings row"
- Consent records are evidence, never permission: nothing reads `adConsentRecords` on the serve path, and serving/reading writes no record — `src/lib/server/services/adConsentService.ts:5-24` · test: `src/lib/server/services/adService.test.ts` › "never reads the record table to make the decision", "writes no consent record when ads are served"
- A consent record is appended only on a real transition: not-granted → true records `granted`; true → false records `withdrawn`; unchanged, or a never-touched user saving with ads off, records nothing — `src/lib/server/services/adConsentService.ts:29-41` · test: `src/lib/server/services/adConsentService.test.ts` › "records nothing for a user who has never touched the setting", "records nothing when the value does not change"
- Records are append-only; history reads newest-first per user, and a read never writes — `src/lib/server/services/adConsentService.ts:45-63` · test: `src/lib/server/services/adConsentService.test.ts` › "appends rather than replacing, so history survives", "returns the whole trail, newest first", "reads nothing into existence — a read never writes a record"
- The month window is the user's zone: `startOf('month')` → `+1 month`, matched against `events.start` — `src/lib/server/services/adService.ts:92-107`
- A Sponsored Event is recognised as a row the user owns whose title starts with `📢` — `src/lib/server/services/adService.ts:97-107`
- Generation fills up to 3 Sponsored Events per month, drawing templates without repeats while templates remain, at 10:00 local on a random day; generated rows are `adType:'sponsored'` with `impressionCount: 0` — `src/lib/server/services/adService.ts:126-183`
- Display projection: title `📢 <message>`, `allDay: true`, no calendar (`calendarId: ''`), amber `#f59e0b`; the API adds `isAd: true` to every row — `src/lib/server/services/adService.ts:294-334`, `src/lib/server/services/calendarData.ts:60, 89-91`, `src/routes/api/sponsored-events/+server.ts:35` · test: `src/routes/api/sponsored-events/server.test.ts` › "opted-in: the requested month, marked isAd + amber"
- A row with no calendar is an ad: it is attributed to no person, so no person filter can hide it and it never carries a Family Member's identity — `src/lib/utils/calendarAssignees.ts:88-101, 128-135`
- Switched off means no ad read at all (the gate is checked before the store is touched) — `src/lib/server/services/calendarData.ts:78-86` · test: `src/routes/api/sponsored-events/server.test.ts` › "not opted in → [] and no ad read"
- Ad rows are pruned weekly (Mondays 04:00) at 90 days, anchored on `adEvents.createdAt`; the count removed is returned — `src/lib/server/db/actions/adEvents.ts:19-26`, `src/routes/api/cron/cleanup/+server.ts:18, 46-48`, `vercel.json:2-7` · test: `src/lib/server/db/actions/adEvents.prune.test.ts` › "deletes only ad rows created before the cutoff", "keeps the rule even when nothing matched"
- `countRecentAdEventsByTargetPlan` groups ad rows created inside the window by `targetPlan` (reporting only; no UI consumer) — `src/lib/server/db/actions/adEvents.ts:27-38` · test: `src/lib/server/db/actions/adEvents.prune.test.ts` › "groups ad rows created inside the window by target plan"
- Impression and click counters increment on the `adEvents` row by id — `src/lib/server/services/adService.ts:223-240`
- ~~Blob assets live under prefix `family-master/ads` …~~ Owner [Q-003](../questions.md): the blob store is deleted, not ported (`src/lib/server/services/blobService.ts`, the unwired helpers at `adService.ts:247-273`, and the `@vercel/blob` dependency go in S8).
- The month parameter is strict: `2026-13`, `2026-1`, `nov` and `2026-11-01` are all rejected, while an absent parameter uses the user zone's current month — `src/routes/api/sponsored-events/+server.ts:19-33` · test: `src/routes/api/sponsored-events/server.test.ts` › "400 for month=%s"
- Sponsored rows survive every calendar/assignee filter because they belong to no calendar — `src/lib/utils/calendarAssignees.ts:128-135`

### Page and UI behaviour worth keeping

- `/account` carries the opt-in checkbox labelled "Show sponsored items" with the copy "Off by default — while it is off, nothing sponsored is shown and nothing is shared with advertisers." — `src/lib/components/account/AccountCalendarSection.svelte:267-278`
- A Sponsored Event chip is told apart by texture (a neutral hatch) rather than a colour, wearing the visible word "Ad" and the accessible name "Sponsored" — `src/lib/utils/chipVocabulary.ts:135-149, 155-189`
- The calendar legend shows a "Sponsored" row with a sample chip and the explanation "a bag glyph over a neutral hatch… its colour still means calendar" — `src/lib/components/calendar/CalendarKey.svelte:50-60, 105`
- The Day Dashboard's glance card names sponsored rows itself (`density: 'word'`, `isAd` carried on the row) — `src/lib/components/dashboard/TodayGlanceCard.svelte:13-15, 69-71`
- Event modals hide the non-ad actions for an ad (no export menu) — `src/lib/components/calendar/EventModalHeader.svelte:41-44`, `src/lib/components/calendar/EventModal.svelte:404-406`

### Probably accidental (candidates to drop, owner to confirm)

- `injectAdEvent` — the only writer of `adEvents` and of `📢` calendar rows — has NO caller anywhere in `src/`, so nothing persists generated ads; `impressions`, `clicks`, `conversions`, `expiresAt` and `deadline` are never written by a live path — `src/lib/server/services/adService.ts:186-221`, `src/lib/server/db/actions/adEvents.ts:5-13` — dead write path
- Because nothing is persisted, `generateAdEventsForMonth` re-randomises template and day on every request, so the same month shows different Sponsored Events on each load — `src/lib/server/services/adService.ts:143-181` — non-deterministic output
- `trackAdImpression`/`trackAdClick` update by `adEvents.id`, but served ids come from `events.id` or a freshly generated id that is never inserted (the adEvents row gets its own separate id) — no served ad can match a row — `src/lib/server/services/adService.ts:105, 167, 207, 223-240` — counters can never increment
- Any user-owned event whose title begins with `📢` is served as a Sponsored Event, and `getAdEventsForUser` then suppresses generation for that whole month — `src/lib/server/services/adService.ts:103, 299-302` — user data read as ad inventory
- The existing-row projection invents values: `adType` always `'sponsored'`, `sponsorName: ''`, `impressionCount: 1` — `src/lib/server/services/adService.ts:108-122` — fabricated fields
- `getAdEventsForUser` itself never checks the serve gate; the gate lives only in `loadSponsoredEvents`, so a direct service caller bypasses it — `src/lib/server/services/adService.ts:294-334` vs `src/lib/server/services/calendarData.ts:84` — gate not co-located with the read
- On the `/calendar` page the ad rows are not tagged `isAd`, so chips render as ordinary all-day events and the only sponsored marking left is the `📢` title prefix — `src/routes/(calendar)/calendar/+page.server.ts:301`, `src/routes/(calendar)/calendar/+page.svelte:318-324`, `src/lib/utils/chipVocabulary.ts:155-158` — labelling breaks on the main surface
- `AdDisplayEvent` fakes a calendar event: `calendarId: ''`, `created_at: new Date()` per response (unstable), `end === start` for an all-day row — `src/lib/server/services/adService.ts:276-334` — placeholder shape
- `uploadAdAsset`/`listBlobAssets` hardcode `contentType: 'image/png'` and `size: 0` regardless of the upload, and `getBlobUrl` takes `blobs[0]` of a prefix listing — `src/lib/server/services/blobService.ts:19-47, 54-68` — stale metadata, ambiguous lookup
- The blob store is public and unmetered and the upload/list/delete helpers have no callers (#180) — `src/lib/server/services/blobService.ts:3, 24`; `src/lib/server/services/adService.ts:247-273` — unwired, pending owner decision
- `AdEventData.adType` admits `'promotional' | 'newsletter'` and `deadline`/`targetPlan` are carried but never populated from the templates — `src/lib/server/services/adService.ts:10-23, 34-66` — dead vocabulary
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#180](../../archive/issues/180-blob-store-public-unmetered.md) Blob store public/unmetered: harden or delete the unwired code. | SECURITY | owner answered Q-003: delete it in S8 (code + `@vercel/blob`) |

## Plan

### New files (role — contents — where the legacy code goes)

| file | role | contents |
|---|---|---|
| `sponsored.contract.ts` | contract | `SponsoredEventsQuery` (optional `month` via kernel `validators.yearMonth('Invalid month')`), `SponsoredEvent`, `SponsoredEventsResponse`, `SPONSORED_EVENT_COLOR`; zod schemas field-for-field with the S2 golden. |
| `sponsored.serve.rules.ts` | rules | `shouldServeSponsoredEvents(settings)` (`adService.ts:77-82`); `isSponsoredTitle` + `sponsoredMessageOf` — the `📢` prefix and the trim (`adService.ts:97-123`). |
| `sponsored.month.rules.ts` | rules | `sponsoredMonthWindow({year, month, zone})` (`adService.ts:92-95`); `sponsoredMonthOf({now, zone})` for an absent month (`+server.ts:19-27`); `planSponsoredMonth({year, month, zone, seed, taken})` — three per month at 10:00 local, no repeated template (`adService.ts:126-183`). The random draw becomes a passed-in seed (Notes question 2). |
| `sponsored.display.rules.ts` | rules | `toSponsoredEvent(row)` — `📢 <message>`, `allDay: true`, `calendarId: ''`, `end === start`, amber, `isAd: true` (`adService.ts:294-334`, `calendarData.ts:60`, `+server.ts:35`). |
| `sponsored.consent.rules.ts` | rules | `sponsoredConsentDecision(previous, next)` (`adConsentService.ts:21-36`). |
| `sponsored.serve.rules.test.ts`, `sponsored.month.rules.test.ts`, `sponsored.display.rules.test.ts`, `sponsored.consent.rules.test.ts` | tests | one input → output table per rules file; expected values from the rule and CONTEXT.md, never from running the code. |
| `sponsored.repo.server.ts` | repo | `findOwnedSponsoredEventRows(db, {ownerId, fromIso, toIso})` (4 columns, start order; `adService.ts:93-108`), `insertSponsoredConsentRecord`, `listSponsoredConsentRecords` (newest first), `deleteSponsoredEventRowsBefore` → count. No impression/click update and no target-plan query: nothing calls them (Notes). |
| `sponsored.fixtures.server.ts` | fixtures | the settings row (gate), a user-owned 📢 Event row, an `adEvents` row, a consent record. |
| `sponsored.repo.db.test.ts` | test | a `rollbackTest` per filtered, ordered or aggregate query. |
| `sponsored.service.server.ts` | service | `listSponsoredEvents`, `recordSponsoredConsentChange`, `listSponsoredConsentHistory`, `pruneSponsoredEventsOlderThan`; authorization, `ctx.clock`, `ctx.ids`; ONE existence read on the generation path (legacy reads the month twice: `adService.ts:138,299`). |
| `sponsored.service.db.test.ts` | test | every IO invariant, titled after the rule. |
| `sponsored.http.server.ts` | http | `listSponsoredEventsEndpoint` = `endpoint({ auth: 'user', query: SponsoredEventsQuery })`, reproducing the golden exactly (`auth`, 400 `Invalid month`, body). |
| `ui/index.ts` | entry | stays empty — the screens own the visuals. |

### Legacy exports: destination, or why they die

| legacy export | destination |
|---|---|
| `shouldServeAds` | `sponsored.serve.rules.ts` as `shouldServeSponsoredEvents` |
| `userAllowsAds` | dies — the gate is checked first inside `listSponsoredEvents`, before any ad read (fixes the bypass at `adService.ts:294-334`) |
| `getExistingAdEventsForMonth` | repo read + `sponsored.display.rules.ts` projection |
| `generateAdEventsForMonth` | `sponsored.month.rules.ts` (`planSponsoredMonth`); no second settings read |
| `injectAdEvent` | dies — no caller in `src/` (dead write path, `adService.ts:186-221`) |
| `trackAdImpression` / `trackAdClick` | die — no route exposes engagement, no served id can match an `adEvents` row (`adService.ts:113,167,207`), and the only `adEvents` writer has no caller; the columns and the prune stay |
| `AdEventData`, `GenerateAdsParams`, `AD_TEMPLATES`, `UploadAdImageParams` | die — internal shapes; templates live in `sponsored.month.rules.ts`; `adType`, `deadline`, `impressionCount` are not on the wire |
| `AdDisplayEvent` | `SponsoredEvent` in `sponsored.contract.ts` |
| `getAdEventsForUser` | folded into `listSponsoredEvents` (gate + window + read + generation + marking in one call) |
| `uploadAdImage`, `getAdImageUrl`, `deleteAdImage`, `listAdImages`, `blobService.ts` | **deleted in S8** — Q-003 answered: the blob store is deleted, no blob port; ads serve without assets |
| `adConsentDecisionFor` | `sponsored.consent.rules.ts` |
| `recordAdConsentChange`, `getAdConsentRecords` | `recordSponsoredConsentChange` / `listSponsoredConsentHistory` |
| `pruneAdEventsOlderThan` | `pruneSponsoredEventsOlderThan` |
| `countRecentAdEventsByTargetPlan` | dies — no consumer in `src/` or on the wire (`adEvents.ts:27-38`), and with no `adEvents` writer it always returns nothing |
| `SPONSORED_EVENT_COLOR`, `loadSponsoredEvents`, `toSponsoredDisplay` (`calendarData.ts`) | `SPONSORED_EVENT_COLOR` + `listSponsoredEvents`; the `calendarData` wrappers die — `calendarPage` calls sponsored directly |

### Wiring notes for later steps

- S4 adds `FOREIGN_READS.sponsored.events` to `scripts/arch/registry.mjs` (reason: serve the 📢 rows a user already owns).
- S6 wires `src/routes/api/sponsored-events/+server.ts` to `listSponsoredEventsEndpoint.handler`; `app`'s cleanup cron calls `pruneSponsoredEventsOlderThan`.
- identity declares `CalendarSettingsConsentPort` in its `index.ts` (`listConsentHistory`, `recordConsentChange`); `GET`/`PATCH /api/me/settings` and the account page pass this module's two functions, so identity never imports sponsored (rank 1 cannot import rank 12). A consent-write failure is logged and never fails the save (`accountData.ts:196-206`).

### Performance (ADR 0010)

The module owns no page and one JSON route; its cost lands on `calendarPage` and `/account`.

- `GET /api/sponsored-events`: one settings read, then at most one month query (bounded by the zone month window, 4 columns, start order); gate off = the settings read only. Legacy costs found: the generation path reads the same month twice (`adService.ts:138,299`), selects every `events` column (`adService.ts:97-101`), and stamps a fresh `created_at` per response (`adService.ts:314,332`). Generation is pure CPU: no network, no write.
- `calendarPage` ad leg: in parallel with the personal/family/verse legs (already `Promise.all`: `(calendar)/calendar/+page.server.ts:170-186`), behind `guard`, so it never blocks the shell and a failure degrades to no ads; gate off = no ad query. The legend needs only the pure gate on the layout's settings — no second settings read.
- `/account`: the consent history is one indexed read (`ad_consent_records_user_recorded_idx`, newest first); a user's trail is a handful of rows.
- Bundle: no client code, no component, no new dependency; the chip recipe and the checkbox stay in the screens that already ship them. No statically imported modal on this module's path.

### Probably-accidental decisions taken in S1

| item | decision |
|---|---|
| "any own event titled 📢 is an ad" (`adService.ts:97-123`) | KEPT (wire-visible) → invariant + owner question 1 |
| generation re-randomises every request (`adService.ts:145-183`) | fix: deterministic per `(user, month)` seed → owner question 2 |
| `created_at` invented per response (`adService.ts:314,332`) | fix: stable value → owner question 3 |
| `injectAdEvent` + never-incrementing counters + target-plan read | all three die: `adEvents` has no writer, no route exposes engagement, and nothing calls the reporting read (Notes) |
| `adType` / `deadline` / `sponsorName` / `impressionCount` fabrication | dropped: internal, not on the wire |
| the gate in the caller, not the read | fixed: first check inside `listSponsoredEvents` |
| `/calendar` rows not marked `isAd` (`(calendar)/calendar/+page.server.ts:301`) | fixed in port: the service marks rows, so every consumer gets `isAd` |
| two zone fallbacks (route `'UTC'` vs `getUserZone` server-local) | fixed: one fallback (settings zone, else UTC) |
| blob helpers with stale metadata | deleted with the blob store (Q-003) |

## Notes

### Decisions

- **Q-003 is answered: the blob store is DELETED in S8.** (Owner answer relayed for this port; `docs/rewrite/questions.md` still shows an empty Answer field, and neither file is in this task's file set.) No `blob` port is designed: `blobService.ts` and `uploadAdImage` / `getAdImageUrl` / `deleteAdImage` / `listAdImages` go in S8, together with `adService.ts`'s `@vercel/blob` import. Ads serve without images.
- **`scripts/arch/registry.mjs` needs two edits outside this file set:** the `sponsored` purpose line still says "blob assets" (trim it), and S4 adds the `FOREIGN_READS.sponsored.events` entry.
- **Consent seam, agreed with the identity port:** identity's `index.ts` declares `CalendarSettingsConsentPort` (`listConsentHistory`, `recordConsentChange`); `/api/me/settings` GET+PATCH and the account page pass this module's two functions. Structural satisfaction, so identity never imports sponsored. The save reads the previous flag before writing and logs a record failure without failing the save (`accountData.ts:184-206`).
- **`events` is read as a declared foreign read.** The 📢 rule lives in `events` (calendar's table); S4 adds the `FOREIGN_READS` entry with its reason. If owner question 1 lands "drop", the read and the entry both disappear and the module needs no calendar access at all.
- **The engagement counters and the target-plan reporting read are dropped, not kept.** `adEvents` has no writer in v2 once `injectAdEvent` dies (`adService.ts:186-221` had no caller), no route exposes impressions/clicks, no served id can match an `adEvents` row (served ids are `events.id` or generated ids; the ad row gets its own id — `adService.ts:113,167,207`), and nothing calls `countRecentAdEventsByTargetPlan` (`adEvents.ts:27-38`). Both are consumer-less internal paths (Speculative Generality), so the port keeps neither; the `adEvents` columns and `pruneSponsoredEventsOlderThan` stay because retention is a must-survive rule of the table the schema owns. A future ad-inventory ticket designs the writer, the counters and the reporting together.
- **Internal-only accidents, dropped (not visible on the wire):** `injectAdEvent` (no caller, `adService.ts:186-221`); `userAllowsAds` (a second gate read inside generation only, so the gate lived in two places, `adService.ts:84-86,132`); `trackAdImpression`/`trackAdClick` and `countRecentAdEventsByTargetPlan` (the paragraph above); the `AdEventData`/`AdDisplayEvent` internal types with `adType: 'sponsored' | 'promotional' | 'newsletter'`, `deadline`, `sponsorName` and `impressionCount: 1` (never on the wire, `adService.ts:10-23,108-122`); the blob helpers and their hardcoded `contentType`/`size` (Q-003); and the second zone resolution (`getUserZone` falling back to the server zone while the route fell back to UTC).
- **No `ui/` component on purpose.** The account checkbox and consent history belong to the `account` screen, the chip word "Ad" / accessible name "Sponsored" and the legend to `calendarPage`; the calendar's glance row keys on `isAd` when it is handed a sponsored event. The module contributes only the `isAd` flag and the amber.

### Files kept for unported importers

None of this module's legacy files survives. S8 must rewire the importers first: `calendarData.ts` and `(calendar)/calendar/+page.server.ts` (calendar), `accountData.ts` (identity / account), `api/cron/cleanup/+server.ts` (app). The four legacy test files (`adService.test.ts`, `adConsentService.test.ts`, `adEvents.prune.test.ts`, `api/sponsored-events/server.test.ts`) are deleted with the sources.

### Questions for the owner

1. **Is an event the user titled `📢 …` still ad inventory?** Context: today any own Event whose title starts with `📢` is served as a Sponsored Event and suppresses generation for that month (`adService.ts:97-123,138-143`) — user-authored data read as paid inventory, visible on the wire and pinned by the S2 goldens. Options: (A) keep it as the only real ad source; (B) drop it, leaving the generated month as the sole source (the goldens change only after this answer). Recommendation: **B**; with A anyone who types 📢 gets an ad and loses the month's real ones.
2. **Should a month's generated Sponsored Events be stable across requests?** Context: today they are re-randomised per request (`adService.ts:145-183`), so two loads of the same month differ; `adEvents` has no user column, so generated ads cannot be persisted per user without DDL (schema is fixed). Options: (A) keep re-randomising (needs randomness in `ctx`, which kernel lacks); (B) derive the draw from a `sha256(userId + 'YYYY-MM')` seed — stable, testable, no DDL, no new port. Recommendation: **B**.
3. **What should `created_at` be for a served row?** Context: the wire carries it, but the projection invents `new Date()` per response (`adService.ts:314,332`), which R5 forbids in v2 anyway. Options: (A) the stored `created_at` for a real row, the month-window start for a generated one (stable, truthful); (B) the request instant from `ctx.clock` (still unstable). Recommendation: **A**; no client orders by it today.

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# sponsored: 0% ported

legacy source files left (4/4, 513 LOC):
  - src/lib/server/db/actions/adEvents.ts (39 LOC, server) importers: 1
  - src/lib/server/services/adConsentService.ts (65 LOC, server) importers: 1
  - src/lib/server/services/adService.ts (335 LOC, server) importers: 2
  - src/lib/server/services/blobService.ts (74 LOC, server) importers: 1

route files not yet wiring-only (1/1):
  - src/routes/api/sponsored-events/+server.ts  /api/sponsored-events

legacy test files left (4/4) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/server/db/actions/adEvents.prune.test.ts [stub-db, 4 tests]
  - src/lib/server/services/adConsentService.test.ts [stub-db, 12 tests]
  - src/lib/server/services/adService.test.ts [stub-db, 13 tests]
  - src/routes/api/sponsored-events/server.test.ts [route, 3 tests]
```
<!-- census:end -->
