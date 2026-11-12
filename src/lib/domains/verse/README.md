# verse

**domain** — Daily Verse: one curated scripture verse per day, its visibility gate, and the strip that renders it.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns: which verse a date gets (a bundled list of 40, no network) and the `esv` label every verse carries.
- Owns: applying the visibility answer — a verse is served only when `showDailyVerse` is on and the `verse` module is not hidden for the viewer.
- Owns: the verse strip component the calendar and the Day Dashboard render.
- Does not own: the Dashboard Module vocabulary and the composed visibility answer — that is `dashboardModules` (the verse is one module, gated by its own `showDailyVerse` too).
- Does not own: where the strip renders (calendar and Day Dashboard screens), or the persisted settings and the `verseTranslation` coercion — those are `identity`.

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: the `DailyVerse`/`DailyVerseBody` contract, `pickDailyVerse`, `VERSE_TRANSLATIONS`. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: `getDailyVerse` (the one use-case) and `getDailyVerseEndpoint`. | — |
| [verse.http.db.test.ts](verse.http.db.test.ts) | test (http golden) | Pins status + body of `GET /api/daily-verse` today, so the port cannot change the Android wire. Committed mode: the legacy handler reads the legacy `db` singleton. | itself (vitest project `db`) |
| [ui/index.ts](ui/index.ts) | entry | Public component: `DailyVerseCard`, the compact strip. | — |

## Public interface

Everything other modules and routes may use, grouped by entry file. One line each: `name` — what it does.

- `index.ts`:
  - `DailyVerse` — a verse as this module hands it out: `reference`, `text`, `attribution`, `translation` (always `'esv'`). Deleting it leaves every caller inventing its own verse shape and re-deriving the label.
  - `DailyVerseBody` — the zod schema (and its type) of the `GET /api/daily-verse` body: `{ verse: { reference, text, attribution } | null }`, without `translation`. One place holds the wire shape the goldens pin.
  - `pickDailyVerse(isoDate: string): DailyVerse` — the pure day → verse selection (ordinal modulo the list). Deleting it moves the index math and the attribution into whatever caller renders the verse.
  - `VERSE_TRANSLATIONS` — the one translation, `[{ id: 'esv', label: 'ESV', attribution: 'Public domain.' }]`. `identity` serves it as `/api/me/settings.verseTranslations`; without the export that module would keep the second copy of the vocabulary.
- `index.server.ts`:
  - `getDailyVerse(ctx, actor, input: { date?: string })` — the use-case behind both surfaces: read the viewer's settings, ask `dashboardModules` for the composed visibility, and return the day's verse or `null`. Deleting it would leave the calendar loader and the endpoint each composing two reads, which is the legacy bug it replaces.
  - `getDailyVerseEndpoint` — the `endpoint()` for `GET /api/daily-verse`: `auth: 'user'`, strict `date` query, exact legacy refusals. Deleting it would push auth and date parsing back into the route file, which R8 keeps wiring-only.
- `ui/index.ts`:
  - `DailyVerseCard` — the strip: "Daily verse" label, italic text, reference, attribution (hidden below `sm`). Props in, no fetch. Deleting it would copy that markup and the attribution rule into the calendar page and the Day Dashboard separately.

## How to test

- Whole module: `npm run test:mod -- verse` (add `--legacy` while legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup.
- Database + services: `*.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: `verse.http.db.test.ts` pins status + body of every endpoint (golden tests). It runs committed mode and must stay byte-identical across S6.
- UI: `ui/*.svelte.test.ts` render with props; state classes are tested without a DOM.
- Fixtures: none — the module owns no tables; its db tests seed `users`, `userSettings`, `families`, `familyMembers` and `dashboardModuleSwitches` through `$lib/kernel/db/tables.server`.

## Invariants

Behaviour that must not change, each with the test that pins it (`file › test title`):

1. **One verse per day, from a bundled list of 40: `index = date.ordinal % 40`.** 2026-01-01 (ordinal 1) → Psalm 23:1; 2026-02-09 (ordinal 40 → 0) → John 3:16; 2026-12-31 (ordinal 365 → 5) → Jeremiah 29:11. — evidence `src/lib/server/services/verseService.ts:196-200` over the 40 entries at `:34-192` — pinned by `verse.http.db.test.ts › "answers that day's verse for ?date=%s"` and `verse.selection.rules.test.ts › "indexes the 40-verse list by day of year modulo 40"`.
2. **Every verse is labelled `translation: 'esv'` and carries attribution `Public domain.`, whatever the viewer's `verseTranslation` says.** — evidence `src/lib/server/services/verseService.ts:199-204`; the setting is read at `src/lib/server/services/calendarData.ts:110-113` and never changes the text. — pinned by `verse.http.db.test.ts › "ignores the viewer's verseTranslation setting (bundled ESV text on every response)"` and `verse.selection.rules.test.ts › "labels every verse esv with the bundled attribution"`.
3. **The vocabulary holds exactly one translation: `esv`, `bundled: true`, attribution `Public domain.`. Nothing is fetched over the network.** — evidence `src/lib/server/services/verseService.ts:23-30`, served to clients as `/api/me/settings.verseTranslations` (`src/lib/server/services/accountData.ts:64-66`, [task-api-spec.md](../../../../docs/guides/task-api-spec.md)), wire contract `docs/guides/task-api-spec.md:554` — pinned by `verse.selection.rules.test.ts › "exposes exactly one translation"`.
4. **Selection is deterministic for a date, varies across dates, and every day of a year lands on one of the 40 curated verses.** — evidence `src/lib/server/services/verseService.ts:196-200` — pinned by `verse.selection.rules.test.ts › "picks one curated verse every day of a leap year and a common year"`.
5. **Visibility is the shared answer, not a local read: `'verse'` not in `hiddenDashboardModules` AND `showDailyVerse === true`.** A missing settings row, a `null` flag, or a never-saved preference means NOT visible; a hidden list naming other or retired ids does not hide it. — evidence `src/lib/dashboardModules.ts:145-161` (`showsForViewer` + the verse's second fact), `src/lib/server/services/calendarData.ts:108-109`, `src/routes/api/daily-verse/+server.ts:29-34` — pinned by `verse.http.db.test.ts` › the `{verse:null}` tests and `"keeps the verse visible when the hidden list names other modules"`.
6. **The verse is a `personal` Dashboard Module: a family master switch never gates it.** — evidence `src/lib/dashboardModules.ts:20-26` (`scope: 'personal'`), `:145-154` (master switch applies to family-scoped ids only) — pinned by `verse.http.db.test.ts › "keeps the verse visible when the family switch for verse is off (personal module)"`.
7. **A failed family-switch read does not hide the verse: the loader degrades, still follows the setting, and reports the leg; the JSON API discards the warning.** — evidence `src/lib/server/services/calendarData.ts:105-109`, warning label `src/lib/server/services/dashboardData.ts:404` — pinned by `verse.service.db.test.ts › "a failing switch read still answers the verse"` (S5; a db test cannot induce the failure through the wire without module mocks, R9).
8. **The wire body is exactly `{verse:{reference,text,attribution}}` or `{verse:null}`; `translation` is stripped.** — evidence `src/routes/api/daily-verse/+server.ts:30-35` — pinned by every `verse.http.db.test.ts` success test (`toEqual`, so an extra field fails).
9. **`date` is optional; absent means "today" from the server clock, not a viewer zone.** — evidence `src/lib/server/services/verseService.ts:213-215`, `src/lib/server/services/calendarData.ts:111-113` — pinned by `verse.http.db.test.ts › "answers today's verse when ?date is absent"` (shape only: the legacy clock is real) and, with an injected clock, `verse.service.db.test.ts › "answers the server's today when date is absent"`.
10. **A present `date` must be exactly `YYYY-MM-DD` and a real calendar date; anything else is 400 `{"error":"Invalid date"}`. `?date=` (present but empty) counts as invalid.** — evidence `src/routes/api/daily-verse/+server.ts:17-23` — pinned by `verse.http.db.test.ts › answers 400 "Invalid date" for date=%s` (six cases, empty included).
11. **Signed out is 401 `{"error":"Unauthorized"}`, decided before the date is looked at.** — evidence `src/routes/api/daily-verse/+server.ts:15-16`, `src/lib/server/utils/requireUser.ts:48-53` — pinned by `verse.http.db.test.ts › "answers 401 … when signed out, before the date check"`.
12. **One composition serves the calendar strip and the JSON API, so the page and the wire cannot disagree.** — evidence `src/routes/(calendar)/calendar/+page.server.ts:186-194` and `src/routes/api/daily-verse/+server.ts:29` both go through `loadDailyVerse` — pinned by `verse.service.db.test.ts` (the service is the only composition) and every http golden.
13. **The strip: uppercase "Daily verse" label, italic verse text, then reference, with attribution hidden below `sm`.** — evidence `src/lib/components/calendar/DailyVerseCard.svelte:7-19`, mounted by `src/lib/components/calendar/Calendar.svelte:517-524` — pinned by `ui/DailyVerseCard.svelte.test.ts` (S7).
14. **The Day Dashboard renders the verse only when the shared visibility needs it, and a failed read shows as "today's verse" in the warning banner.** — evidence `src/lib/server/services/dashboardData.ts:393-405` — pinned by the dashboard screen's tests (S7); the gate itself is invariant 5.
15. **`verseTranslation` is persisted with default `'esv'`, and a value outside the vocabulary is coerced back to `'esv'` on save.** — evidence `src/lib/server/db/schema.ts:66`, `src/lib/server/services/accountData.ts:30,159` — owned by `identity` now; pinned by its settings contract test, with the vocabulary itself pinned here by invariant 3.

## Depends on

- May import: kernel, identity, billing, alerts, family, dashboardModules, bills, parsing, calendar, tasks, groceries (public entries only).
- Owns tables: none — the module has no repo; it reads the viewer's settings through `identity` and the composed visibility through `dashboardModules`.
- Reads (join only): none.
- Calls: `dashboardModules` — the composed `DashboardVisibility` (the verse must never re-derive its gate); `identity` — the viewer's settings row (`showDailyVerse`, `hiddenDashboardModules`, `verseTranslation`).
- Called by: `calendar` (the strip above the grid, through the page loader) and the Day Dashboard screen; `GET /api/daily-verse` (Android and the website).
