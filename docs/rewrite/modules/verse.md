# Port sheet: verse

**domain** · rank 11 · port #9 · home: `src/lib/domains/verse/` · README after the port: `src/lib/domains/verse/README.md` (written in S1)

Daily Verse: fetch, cache, translation, the verse card.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries.
- **Owns tables:** none.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
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

- One verse per day from the bundled list (`date.ordinal % 40`; Jan 1 → Psalm 23:1). Every response is labelled `translation: 'esv'` regardless of the user's setting; see the inventory for the attribution text. Dual gate with dashboardModules: a module hide plus `showDailyVerse === true`.
- `GET /api/daily-verse?date=` shape (Android).

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface

| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/daily-verse` | GET | signed-in via `requireUserJson` (missing session → 401 `{"error":"Unauthorized"}`) | `?date=YYYY-MM-DD` optional; absent = today; if present it must match `^\d{4}-\d{2}-\d{2}$` AND parse under Luxon; no body | 200 `{verse:{reference,text,attribution}}`, or `{verse:null}` when the verse is not visible | 400 `Invalid date` | `src/routes/api/daily-verse/+server.ts:14-35`; `src/lib/server/utils/requireUser.ts:48-53` |

### Rules the module must keep

- One verse per day, chosen by day-of-year: index = `date.ordinal % DAILY_VERSES.length` over 40 curated verses (Jan 1 → Psalm 23:1, Dec 31 2026 → Jeremiah 29:11) — `src/lib/server/services/verseService.ts:196-201` · test: `src/lib/server/services/verseService.test.ts` › "indexes by day-of-year modulo the verse count"
- Selection is deterministic for a date and varies across dates; every result is one of the 40 curated verses — `src/lib/server/services/verseService.ts:196-204` · test: `src/lib/server/services/verseService.test.ts` › "is deterministic: same date, same verse", "varies across dates", "stays in range across a whole year"
- There is exactly ONE translation, `esv`, marked `bundled: true`, attribution `"Public domain."`; no other translation exists in the vocabulary — `src/lib/server/services/verseService.ts:23-31` · test: `src/lib/server/services/verseService.test.ts` › "exposes exactly one supported translation (ESV)", "marks ESV as bundled (local list only, no remote fetch)"
- The translation argument is IGNORED: every value (including an unknown one) returns the bundled text with `translation:'esv'`, `fallback:false`, attribution `"Public domain."`, with no network call — `src/lib/server/services/verseService.ts:207-211` · test: `src/lib/server/services/verseService.test.ts` › "treats unknown translations as bundled ESV-branded text", "resolves from the bundled list with no fallback flag and no network"
- "Today" is the server's local day (`DateTime.now().toISODate()`), not a user-zone day — `src/lib/server/services/verseService.ts:213-215` · test: `src/lib/server/services/verseService.test.ts` › "returns today's verse with a valid shape"
- Visibility is the shared answer, not a local read: the viewer's `hiddenDashboardModules` must not contain `verse` AND `userSettings.showDailyVerse` must be `true`; a missing settings row, a null flag, or a never-saved preference means NOT visible — `src/lib/dashboardModules.ts:135-170`, `src/lib/server/services/calendarData.ts:100-109` · test: `src/routes/api/daily-verse/server.test.ts` › "null when the user hid the verse", "null when the verse module is in the hidden list (setting still on)"
- The verse is a PERSONAL Dashboard Module (`scope: 'personal'`), so a family master switch never gates it; only the viewer's hidden list does — `src/lib/dashboardModules.ts:20-26, 157-160`
- If the family module-switch read fails, the verse still follows the setting and a warning is returned by the loader (the API discards the warning) — `src/lib/server/services/calendarData.ts:105-114` · test: `src/routes/api/daily-verse/server.test.ts` › "a failing switch read still answers (the loader degrade)"
- The API shape is exactly three fields; `translation` and `fallback` are stripped before serialisation — `src/routes/api/daily-verse/+server.ts:30-34` · test: `src/routes/api/daily-verse/server.test.ts` › "returns that day's verse {reference,text,attribution}"
- `verseTranslation` is a persisted setting defaulting to `'esv'`; any value outside `TRANSLATIONS` is coerced back to `'esv'` on save — `src/lib/server/db/schema.ts:66`, `src/lib/server/services/accountData.ts:159`
- One loader serves both the calendar page strip and the API, so the two can never disagree — `src/routes/(calendar)/calendar/+page.server.ts:186-194`, `src/routes/api/daily-verse/+server.ts:29`
- Date validation is strict (exactly `YYYY-MM-DD`, zero-padded) and Luxon must consider it valid; `2026-11-32`, `11/02/2026` and `today` are all rejected — `src/routes/api/daily-verse/+server.ts:17-23` · test: `src/routes/api/daily-verse/server.test.ts` › "400 for date=%s"

### Page and UI behaviour worth keeping

- The calendar renders a compact strip above the grid when a verse is present: uppercase "Daily verse" label, italic verse text, then reference and attribution (attribution hidden below `sm`) — `src/lib/components/calendar/DailyVerseCard.svelte:7-19`, `src/lib/components/calendar/Calendar.svelte:517-525`
- The Day Dashboard renders the verse only when `visibility.needs('verse')`, in the user's `verseTranslation` — `src/lib/server/services/dashboardData.ts:393-399`
- `/account` carries the per-user `showDailyVerse` toggle, unchecked when the setting is absent — `src/lib/components/account/AccountCalendarSection.svelte:234-237`
- Loader failures are surfaced as a friendly label ("today's verse") in the dashboard warning banner rather than a raw module id — `src/lib/server/services/dashboardData.ts:404`

### Probably accidental (candidates to drop, owner to confirm)

- The curated text is KJV-style ("begotten", "thou", "saith the LORD") yet is labelled `translation: 'esv'`; ESV is copyrighted, so the public-domain text is not ESV — `src/lib/server/services/verseService.ts:23-31, 34-42` — mislabelled translation
- `getVerseForDate(dateIso, _translation)` keeps a dead parameter "for API stability" that no branch reads — `src/lib/server/services/verseService.ts:207-211` — dead surface
- `DailyVerse.fallback` is always `false` and never leaves the service (the API strips it) — `src/lib/server/services/verseService.ts:201-204`, `src/routes/api/daily-verse/+server.ts:30-34` — dead field
- The service does not validate its date: an unparseable ISO string yields `ordinal = NaN`, so the array lookup misses and the returned object has `undefined` reference/text (the route guards it, direct callers do not) — `src/lib/server/services/verseService.ts:196-205` — unchecked precondition
- "Today" uses the server clock with no user zone, so a viewer in another zone can be shown yesterday's or tomorrow's verse — `src/lib/server/services/verseService.ts:213-215` — zone bug
- `DAILY_VERSES` is exported wholesale "for tests", widening the public surface to the data table — `src/lib/server/services/verseService.ts:190-194` — export for tests only
- `loadDailyVerse` fetches the family's module switches on every read although the verse is a personal module, and a failed read is swallowed — `src/lib/server/services/calendarData.ts:105-109`, `src/routes/api/daily-verse/+server.ts:29` — wasted read
<!-- inventory:end -->

## Carry-over tickets

None.

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# verse: 0% ported

legacy source files left (2/2, 237 LOC):
  - src/lib/components/calendar/DailyVerseCard.svelte (21 LOC, ui) importers: 1
  - src/lib/server/services/verseService.ts (216 LOC, server) importers: 4

route files not yet wiring-only (1/1):
  - src/routes/api/daily-verse/+server.ts  /api/daily-verse

legacy test files left (2/2) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/server/services/verseService.test.ts [pure, 13 tests]
  - src/routes/api/daily-verse/server.test.ts [route, 5 tests]
```
<!-- census:end -->
