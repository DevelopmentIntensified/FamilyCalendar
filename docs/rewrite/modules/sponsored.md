# Port sheet: sponsored

**domain** · rank 12 · port #12 · home: `src/lib/domains/sponsored/` · README after the port: `src/lib/domains/sponsored/README.md` (written in S1)

Sponsored Events: serve gate (showAdsAsEvents), month generation, impressions/clicks, consent records, blob assets.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries, verse.
- **Owns tables:** `adEvents`, `adConsentRecords`.
- **Must be ported first:** identity (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `________`
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

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

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
