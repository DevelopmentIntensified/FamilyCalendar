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

New files below `src/lib/domains/verse/` (designed in S1; contract/rules in S3, repo/fixtures in S4, service in S5, http in S6, ui in S7):

| file | role | what goes in it |
|---|---|---|
| `verse.contract.ts` | contract | `DailyVerse` (`reference`, `text`, `attribution`, `translation: 'esv'`), `DailyVerseBody` (`{ verse: {reference,text,attribution} \| null }`), `DailyVerseQuery` (`date` absent-or-strict-`YYYY-MM-DD`, message `Invalid date`). |
| `verse.selection.rules.ts` | rules | the 40 curated verses (private), `pickDailyVerse(isoDate)`, `VERSE_TRANSLATIONS` (one entry) and the `Public domain.` attribution. |
| `verse.selection.rules.test.ts` | rules test | day → verse table (Jan 1, ordinal 40, Dec 31), whole-year coverage, the `esv` label on every verse, one vocabulary entry. |
| `verse.service.server.ts` | service | `getDailyVerse(ctx, actor, { date? })`: the viewer's settings, the composed `dashboardModules` visibility, then selection; a failed switch read degrades to the setting and reports a fault. |
| `verse.service.db.test.ts` | service test | the gate matrix over real rows, the clock-injected "today", the degrade, and invariant 12 (one composition). |
| `verse.http.server.ts` | http | `getDailyVerseEndpoint`: `endpoint({ auth: 'user', query })`, 401 before the date, 400 `Invalid date`, 200 three-field body. |
| `verse.http.db.test.ts` | http golden | written in S2 against the legacy route; frozen at its S2 content through S6. |
| `ui/DailyVerseCard.svelte` | ui | the strip, rebuilt on `kernel/ui` primitives; props `verse: DailyVerse`; no fetch. |
| `ui/DailyVerseCard.svelte.test.ts` | ui test | label, italic text, reference, attribution hidden below `sm`. |
| `index.ts`, `index.server.ts`, `ui/index.ts` | entries | the re-exports listed in the README's Public interface. |
| `README.md` | doc | the module's front door (written in S1). |

No `repo` and no `fixtures`: the module owns no tables; it reads `identity`'s settings and `dashboardModules`' answer through their public entries. No `api` and no `state`: both surfaces are server-rendered loads and the card is prop-driven.

Where each legacy export goes:

| legacy | outcome |
|---|---|
| `DailyVerse` (`src/lib/server/services/verseService.ts:3-9`) | `verse.contract.ts` `DailyVerse`, minus `fallback`. |
| `CuratedVerse` (`:11-14`) | private element type of the list in `verse.selection.rules.ts`. |
| `TRANSLATIONS` / `VerseTranslationInfo` / `TranslationId` (`:16-32`) | `VERSE_TRANSLATIONS` in `verse.selection.rules.ts` (one entry, `as const`); `identity` keeps serving it as `/api/me/settings.verseTranslations`. |
| `DAILY_VERSES` and `export { DAILY_VERSES }` (`:34-194`) | private constant in `verse.selection.rules.ts`. The export dies: it existed "for tests" and widened the surface to the data table. |
| `bundledVerseForDate` (`:196-205`) | `pickDailyVerse`. |
| `getVerseForDate` / `getTodayVerse` (`:207-215`) | one `getDailyVerse(ctx, actor, { date? })`; the `_translation` parameter dies and "today" comes from `ctx.clock`. |
| `loadDailyVerse` (`src/lib/server/services/calendarData.ts:100-116`) | `getDailyVerse`. Its `warning` string becomes a kernel fault report; the dashboard screen keeps its own "today's verse" warning label. |
| `DailyVerseCard.svelte` (`src/lib/components/calendar/DailyVerseCard.svelte`) | `ui/DailyVerseCard.svelte`, rebuilt from the rule in invariant 13. |
| `GET` in `src/routes/api/daily-verse/+server.ts` | wiring only: `export const GET = getDailyVerseEndpoint.handler;` (R8). |

## Notes

- S1 verified the draft inventory against the code. Two corrections to the API table: the route strips `translation` as well, so the wire is exactly `{reference,text,attribution}`; and `?date=` (present, empty) is invalid (400), not an omitted date.
- Golden coverage (S2): all goldens run committed mode because the legacy handler reads through the legacy `db` singleton. Every visibility branch (no settings row, `false`, `null`, hidden `verse`, other/retired ids in the hidden list, personal-scope family switch off, another user's settings), the three selection anchors, absent vs empty vs invalid `date`, and 401-before-400 are pinned. The "failing switch read" degrade is NOT reachable through the wire without module mocking (R9 forbids it), so it stays a `verse.service.db.test.ts` test.
- Probably accidental items, decided:
  - ESV label on KJV-style public-domain text — visible on the `/api/me/settings.verseTranslations` wire → kept as invariants 2/3, owner question 1.
  - "Today" from the server clock, no viewer zone — visible on the wire (absent `date`) → kept as invariant 9, owner question 2.
  - `_translation` parameter — internal → dies (one service, no translation argument).
  - `DailyVerse.fallback` — internal, never left the service → dies.
  - Unvalidated date inside the service (bad ISO → `NaN` ordinal → `undefined` fields) — internal, the route guards it → dies: the contract validates and the rule is typed to a validated date.
  - `DAILY_VERSES` exported "for tests" — internal → dies; the rules test walks whole years.
  - A family-switch read on every verse request although the verse is personal — internal (an extra SELECT) → dissolves: the verse asks `dashboardModules` for the composed answer and stops reading switches itself.
- One composition (invariant 12): the calendar strip will call `getDailyVerse` from the calendar screen's loader; the `calendar` module owns that call site.

### Questions for the owner

1. **ESV label on public-domain text.** `CONTEXT.md` says the verse renders "in the user's `verseTranslation` (ESV by default)" and `/api/me/settings` exposes `verseTranslations:[{id:'esv',label:'ESV',attribution:'Public domain.'}]`, but the bundled text is KJV wording ("begotten", "thou", "saith the LORD") — ESV is copyrighted, so this is not ESV text.
   Options: (a) keep as-is, no wire change; (b) relabel the entry `KJV` / attribution `Public domain (King James Version).` — a `/api/me/settings.verseTranslations` wire change, Android reads `label` only; (c) fetch real ESV text, which needs a Crossway key and kills the no-network rule.
   *Recommendation:* (b) as its own owner-approved change after the port; the port keeps (a) exactly, because invariants 2/3 are the installed contract.
2. **"Today" ignores the viewer's zone.** An absent `date` uses the server's local day, so a viewer in another zone can be shown yesterday's or tomorrow's verse. Options: (a) keep, no wire change, calendar strip and API always agree; (b) use the viewer's `timeZone` setting for an absent `date`, which matches the rest of their dashboard but can differ between server and client around midnight. *Recommendation:* (b) as a follow-up ticket; it changes the absent-`date` contract, so it must not be folded into S6.

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
