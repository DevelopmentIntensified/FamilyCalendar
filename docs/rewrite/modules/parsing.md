# Port sheet: parsing

**domain** · rank 7 · port #8 · home: `src/lib/domains/parsing/` · README after the port: `src/lib/domains/parsing/README.md` (written in S1)

Natural-language grammars: event quick-add, task quick-add (shared parse vectors with Android), bill hints, date vocabulary, the claim book.

- **May import:** kernel, identity, billing, alerts, family, dashboardModules, bills.
- **Owns tables:** none.
- **Must be ported first:** bills (from the legacy import graph; see the ledger).
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

- Every phrase suite stays green (NLP ~600 phrases, claim guards, task quick-add 141, date resolution). Test-first for any change (AGENTS.md NLP rule).
- `shared/parse-vectors.json`: 145 vectors, lockstep with the Android suite.
- Cadence wire format `daily|weekly|biweekly|monthly|every_N_units`; `biweekly` = every 2 weeks.
- Rollover: today stays today; an explicit year wins; a clamped day (Feb 30 → 28/29) never rolls.
- Claim book: one grammar family owns each span (parserClaimGuards).
- `POST /api/parse-event`: anonymous allowed (regex only); zone used only when signed in; AI gating per billing.

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/parse-event` | POST | none — Anonymous Account allowed (regex only); cloud path requires a signed-in user | JSON body `{ input: string, useCloud?: boolean }`; `useCloud` absent ⇒ `true`; `input` absent/null/blank/whitespace ⇒ 400 | `{ parsed, confidence, method }` with method `cloud` (confidence 0.85), `regex` or `regex-fallback`; when `parseEventList` yields >1 event: `{ results: ParseResult[], method: 'regex-list' }` (no top-level confidence) | `400: "Input required"`; `429: <cap.reason>` (fallback text `"AI usage limit reached"`) | `src/routes/api/parse-event/+server.ts:66-70,99-131,135-137` · test: `src/routes/api/parse-event/server.test.ts` › "refuses over-cap callers with 429 before any vendor call" |

### Rules the module must keep
- One rollover rule, shared by event, bill and Task quick-add: an explicit year wins even when past; otherwise the current year, rolling +1 year only when the month-day sits strictly before today — **today stays today**; the day is clamped to the month length, and a clamped day never rolls; month outside 1–12 or day outside 1–31 returns null — `src/lib/utils/dateResolution.ts:73-98` · test: `src/lib/utils/dateResolution.test.ts` › "keeps TODAY as today — typing the current date must not jump a year", "clamps the day to a short month (\"feb 30\" is the 28th)"
- `daysInMonth` is pure arithmetic (proleptic Gregorian), never a `Date` probe, so "Feb 29" in a common year is 28 and cannot roll into March — `src/lib/utils/dateResolution.ts:38-47` · test: `src/lib/utils/dateResolution.test.ts` › "holds the rule across every day of a leap and a non-leap year"
- A bare weekday always means the next occurrence, 1..7 days out; today itself rolls a full week, never 0 — `src/lib/utils/dateResolution.ts:100-104`, `src/lib/server/services/naturalLanguageService.ts:65-75` · test: `src/lib/utils/dateResolution.test.ts` › "never returns 0 — a bare weekday is always a future occurrence"
- Cadence wire format is `daily|weekly|biweekly|monthly|yearly|every_N_units`; `biweekly` is the canonical spelling of every-2-weeks, `every_2_days`/`every_2_months` never collapse into it; `valueToCadence` still accepts legacy `every_2_weeks`; `cadenceFrequency` collapses every-N onto `daily|weekly|monthly|yearly`; unit spellings day(s)/week(s)/wk(s)/month(s)/mo(s)/year(s)/yr(s) — `src/lib/utils/dateResolution.ts:105-205` · test: `src/lib/utils/dateResolution.parsers.test.ts` › "every 2 weeks is weekly x 2, whichever parser and whichever value word"
- The shared cadence phrase table is ordered longest-phrase-first and first match wins: `every other <unit>` (×2), `every N <unit>`, quarterly/per quarter//quarter and `every quarter` (month×3), biannually/bi-annually/semi-annually/twice a|per year/every half year (month×6), `daily|nightly`, `weekly`, `monthly`, `yearly|annually`; the optional `repeat(s)` prefix is part of the matched span so it is stripped from titles — `src/lib/utils/dateResolution.ts:213-282` · test: `src/lib/utils/dateResolution.test.ts` › "matchCadence — the shared cadence phrase table" (36 phrases, 9 non-cadences such as "once a month", "every saturday", "next week")
- `dateParsing.ts` is a thin shared layer over `dateVocab`: re-exports `MONTH_ALT`, `MONTH_MAP` (= `MONTH_INDEX_1`, 1-based), `DAY_ALT` and a full-weekdays-only `DAY_MAP` (no short forms), plus `dayNumber`, `normalizeTime`, `normalizeMeridiem` (strips periods so "p.m."/"a. m." become `pm`/`am`, bare partials like "p" pass through unchanged), `applyPeriod` and `escapeRegExp` — `src/lib/server/utils/dateParsing.ts:8-60` · test: `src/lib/utils/dateVocab.test.ts` › "DAY_ALT does NOT match short forms (intentional — dateParsing uses only full)", `naturalLanguageService.test.ts` › "Perioded meridiem (\"8:00 p.m.\") + activity-then-place suffix (#207)"
- `dateVocab` is the one token address: months incl. `jun`/`jul`, longest-first `MONTH_ALT` (september before sept/sep), ordinal words with hyphen/spaced/fused forms, full+short weekdays, `DAYPART_TIMES` (morning 09:00, afternoon 14:00, evening 18:00, noon 12:00), `TOD_TIMES` (early morning 06:00), recurrence unit words — `src/lib/utils/dateVocab.ts:74,94,157-183,242-262` · test: `src/lib/utils/dateVocab.test.ts` (36 cases) › "MONTH_ALT is longest-first (september before sep and sept)"
- Weekday typos resolve fuzzily: words shorter than 4 chars never match, month names never match, exact names win before the edit-distance scan, adjacent transposition counts as one typo, budget 1 below 7 chars and 2 from 7 — `src/lib/utils/dateVocab.ts:218-241` · test: `src/lib/server/services/naturalLanguageService.test.ts` › "does not invent weekdays from short words (\"we sat by the sun\")"
- URLs are captured whole from the input, removed from every title/date scan (`nonUrlText`), ride into `description`, and can never be cut by the 50-char title window — `src/lib/server/services/naturalLanguageService.ts:483-487,2019-2022` · test: `src/lib/server/services/naturalLanguageService.test.ts` › "URL fidelity (issue 025)"
- An early `until <date>` capture is blanked to the same character length in `dateInput` so it can never be stolen as the event date; it only becomes `recurringUntil` when a frequency was found — `src/lib/server/services/naturalLanguageService.ts:488-503,1165-1174` · test: `naturalLanguageService.test.ts` › "parses \"yoga every Monday until Dec 15\" without stealing the date"
- Claim book: each grammar family claims the exact span it consumed; overlapping claims are dropped; `maskClaims` blanks claimed ranges (same offsets, newlines preserved); the masked view feeds the weekday scan, bare-weekday fallback, invite list, calendar targeting, "at my …" and "on <address>" reads — `src/lib/server/services/naturalLanguageService.ts:505-526,1117,1181,1700-1712,1740,1753,1824` · test: `src/lib/server/services/parserClaimGuards.test.ts` (12 cases) › "a weekly scan does not re-claim the weekday of a date rule"
- Date chain is first-match-wins: `this <weekday>`, `next <weekday>` (+1 further week), today, tomorrow, `in N days|weeks|months`, `in N min|hrs` (also sets startTime), weekend → upcoming Saturday (a Saturday today → +7), `next <month>` → 1st of that month next year, `returning [by] <weekday> [daypart]`, month-day, day-first, ISO, ordinal digit-first, ordinal word, ordinal weekday, `MM/DD` — `src/lib/server/services/naturalLanguageService.ts:543-771`
- An ordinal weekday (`first|…|fifth|last <weekday> of <month|the month>`) that cannot exist resolves to no date; when it is in the past it advances to the next month ("the month") or next year (named month) — `src/lib/server/services/naturalLanguageService.ts:77-104,725-760` · test: `naturalLanguageService.test.ts` › "parses \"deadline last Friday of the month\" as a late-month Friday"
- An explicit-date sweep collects every named date plus its span; continuations (`& 30`, `, 12`, `and 19`) borrow month/year from the nearest preceding date, and a following colon marks a time, never a day — `src/lib/server/services/naturalLanguageService.ts:773-857`
- Maximal chains of 2+ dates (joined only by `and`, `,` or `&`, optionally bridging "the") become one event per date in `dates[]`, capped at 5; duplicate resolutions collapse but the surviving date is kept rather than discarding the whole list; `date` = `dates[0]` — `src/lib/server/services/naturalLanguageService.ts:860-941` · test: `naturalLanguageService.test.ts` › "keeps the date when today and a literal name the SAME day, instead of losing both", "caps span expansion at five dates"
- All-day cues are `all day`, `all-day`, `whole day`, `birthday`; an all-day event with no start time defaults to 09:00–17:00 — `src/lib/server/services/naturalLanguageService.ts:1035-1039,2027-2030`
- Time ranges are matched before single times, and a missing start meridiem inherits the end's ("5:30-6:30pm" is evening): colon range, `from 2-4pm`/`from 9 to 5 pm`, `between 2 and 4 PM`, bare `6-8pm`/`6 to 8pm` (only when the end carries a meridiem, so "20-30 pages" never matches) — `src/lib/server/services/naturalLanguageService.ts:948-1032` · test: `naturalLanguageService.test.ts` › "Hyphen range meridiem propagation (\"5:30-6:30pm\")"
- Single-time rule: `at|starting at|beginning at H[:MM][am/pm]` (no meridiem and hour < 8 ⇒ +12), standalone `H:MM am/pm` or bare `6am`, `at noon|midnight|dusk|dawn` → 12:00/00:00/20:00/06:00, `half past|quarter past|quarter to` with numeral or word hour, compact military `HHMM` (skips `20xx` year runs and keeps scanning to the next digit run, on URL-free claim-masked text), time-of-day anchors — `src/lib/server/services/naturalLanguageService.ts:1242-1390` · test: `parserClaimGuards.test.ts` › "military time skips claimed digit runs in either word order"
- End-time cues: `wrapping up`, `finishes/finishing/concludes`, `going on|continuing until`, `till|until`, `ends at|ending|closing`, `returning|back by`, `staying until sunset|dusk` (20:00), `running late|going until we` (23:00), `until midnight` (00:00); durations (`for|about|lasting N min|hr`) set `endTime` only when a start time exists and no end was found — `src/lib/server/services/naturalLanguageService.ts:1450-1608`
- Event recurrence runs one ordered table, first match only, and strips the matched phrase from the title: `monthly on the Nth`, `weekly on <weekday>s`, `every other <unit>`, `every N <unit>`, `every <weekday>`, `repeat(s) every <unit>`, `repeat(s) daily|weekly|monthly|yearly|annually`, `every <unit>`, `daily|every day`, `weekly`, `monthly`, `yearly|annually` (`(?<![\w-])` so "bi-annually" is not yearly); the shared cadence table runs last, only when nothing above matched — `src/lib/server/services/naturalLanguageService.ts:1044-1110` · test: `naturalLanguageService.test.ts` › "does not leak the recurrence phrase into the title"
- Weekly day lists come from one weekday-token scan over the claim-masked date: a trigger (`every|weekly|each`) or any raw token ending in "s" makes `recurring=weekly` + `recurringByDay` (Monday-first order) and anchors `date` on the nearest listed day; a bare conjunction pair with no trigger becomes concrete `dates[]`, not weekly; a lone weekday with no trigger stays a one-off — `src/lib/server/services/naturalLanguageService.ts:1112-1150` · test: `naturalLanguageService.test.ts` › "leaves lone weekdays alone (\"lunch Monday\" stays a single event)"
- `weekdays` ⇒ MO–FR, `weekends` ⇒ SA+SU (both anchor the next matching date), `twice a week` ⇒ weekly with no invented by-day — `src/lib/server/services/naturalLanguageService.ts:1204-1229` · test: `naturalLanguageService.test.ts` › "treats \"twice a week\" as weekly without inventing days"
- Recurrence end only applies when a frequency exists: `for N days|weeks|months|years|times|occurrences|sessions` or bare `N times` → `recurringCount` (min 1); `until <date>` → `recurringUntil` — `src/lib/server/services/naturalLanguageService.ts:1153-1174` · test: `naturalLanguageService.test.ts` › "ignores counts without a recurrence (\"party in 2 weeks\", \"buy milk 2 times\")"
- Bare-weekday fallback runs last: first exact weekday becomes the next occurrence; a typo-only match resolves fuzzily with lower confidence — `src/lib/server/services/naturalLanguageService.ts:1176-1202`
- Reminder cue `remind me|reminder N min|hour|day(s) before` → `reminderMinutes` (1, 60 or 1440 per unit) — `src/lib/server/services/naturalLanguageService.ts:1230-1239` · test: `naturalLanguageService.test.ts` › "Reminders (\"remind me 30 min before\")"
- Location priority: `location: X` > `location at|is|in X` > bare uppercase token ≤4 chars > street address (number + street type, optional city/state/zip) > `goes (over) to|heading to <place>` > `at <place>`/`in the <place>` > compromise `places()` > `at home` > `at my|our X [on <Address>]` > `on <Address>` > `at X studio|center|park|garden|square|clubhouse|trailhead`; trailing punctuation is stripped — `src/lib/server/services/naturalLanguageService.ts:1612-1736` · test: `naturalLanguageService.test.ts` › "keeps an explicit \"location:\" over NLP place guesses"
- Place grammar reads at most five words and stops at schedule prepositions/conjunctions and at calendar words (weekday, month, ordinal, today/tomorrow, next/last/this/that), never starts on an article/home/daypart/meal or a clock token, and requires a lowercase "the" after "in" ("at The Olive Garden" keeps its article) — `src/lib/server/services/naturalLanguageService.ts:309-470` · test: `parserClaimGuards.test.ts` › "a place name stops at the day words the date family claims"
- Calendar targeting stores `"<name> calendar"` from `on|to [the|my] <name> calendar`; only the household defaults `family`/`personal` may route without a preposition (leading or trailing); a bare "calendar" is ignored — `src/lib/server/services/naturalLanguageService.ts:1738-1765` · test: `naturalLanguageService.test.ts` › "does not route \"family reunion saturday\" (no calendar phrase)"
- Attendants priority: with-list (max two words per name, articles dropped, lowercase list needs one compromise person hit) > `invite X` (claim-masked, stops at a preposition) > speaker patterns ("Alex and I", "My sister and I") > group patterns ("including X", "the whole X") > compromise `people()` last (names ≤2 chars filtered); duplicates merge case-insensitively; a with-list that runs to the end of the title is removed from the title, a mid-title list is kept — `src/lib/server/services/naturalLanguageService.ts:1766-1901` · test: `naturalLanguageService.test.ts` › "does not read non-name lists as attendants"
- Title = unmatched text: recurrence phrases and claimed date/location spans are stripped, at most 50 characters are kept, a cut inside a word snaps back to the last space, a dangling connector and trailing punctuation go, the title is only set when longer than 3 chars, and when stripping empties it the raw 50-char window is restored; a "remind me"/relative-duration phrase keeps its whole stripped sentence — `src/lib/server/services/naturalLanguageService.ts:1905-1990` · test: `naturalLanguageService.test.ts` › "never ends the title mid-word at the 50-char cut", "falls back to the raw text when stripping leaves nothing (\"sept 23\")"
- Defaults: an unmatched date becomes today; an `@ Location` suffix is read as location (stopping at date/time/"View & RSVP"); confidence is capped at 1 — `src/lib/server/services/naturalLanguageService.ts:1995-2033`
- Multi-event segmentation: split on `;`/newline, else commas only when every part carries `COMMA_SIGNAL`, else `and` only when both halves carry `SEGMENT_SIGNAL` and no weekday-pair/date-chain/with-list veto applies; fewer than two segments at confidence ≥ 0.3 returns the single parse; schedule-only continuation segments inherit the head title and attendants — `src/lib/server/services/naturalLanguageService.ts:2038-2197` · test: `naturalLanguageService.test.ts` › "Multi-event segmentation (\"dinner Friday and movie Saturday\")"
- Task quick-add strips deterministically: priority → recurrence cadence → due date → `#public/#private` and `@handle` scoping → generic assignee → `#tags` → whitespace cleanup; an emptied title falls back to the raw input — `src/lib/utils/taskQuickAdd.ts:475-588`
- Task due-date priority: `next <weekday>` → month+day[, year] → `in N units`/`next week|month|year` → bare `today|tomorrow|<weekday>`; every due lands at local 23:59; a weekday named on that weekday means next week; month/year arithmetic clamps to the target month length — `src/lib/utils/taskQuickAdd.ts:241-315,366-418` · test: `shared/parse-vectors.json` § "parseTaskQuickAdd — due-date phrases"
- Task roster scoping: `@family` sets `familyTask`; `@name` resolves the greedy longest of `First Last`/`First`/`Last`, a tie between different members yields `unknownMember` with `userId: null` and still cuts the consumed text; without an `@` token `findTaskAssignee` takes the earliest occurrence (longest at the same spot) over triggers ordered `@`, `assign to`, `assign`, `task`, `for`, `to` — `src/lib/utils/taskQuickAdd.ts:189-232,437-472,529-572` · test: `shared/parse-vectors.json` § "findTaskAssignee — roster-scoped assignee matching" (15 vectors)
- Task tags are lowercased, de-duplicated and sorted; `#public/#private` is last-wins and sets `visibilityExplicit`; an unknown/ambiguous `@member` is returned as `unknownMember` rather than silently dropped — `src/lib/utils/taskQuickAdd.ts:155-164,521-527,549-560` · test: `shared/parse-vectors.json` § "scoping: #public/#private, @family, @name" (23 vectors)
- The shared parse vectors are the lockstep contract: 145 vectors in 11 sections with pinned `now` 2026-08-28T10:00Z and 7 rosters, only present keys asserted, due compared as a local calendar day at 23:59; `EXPECTED_VECTORS = 145` gates drift against the Android suite — `shared/parse-vectors.json`, `src/lib/utils/taskQuickAdd.test.ts:134-151` · test: `src/lib/utils/taskQuickAdd.test.ts` › "matches the expected case count"
- Bill hints (`parseBillQuickAdd`) strip in the order category → first resolving due cue → recurrence → amount → title; a `#tag` only counts when it is exactly one of the closed bill categories, otherwise merchant keywords scan the ORIGINAL input; category falls back to `other` — `src/lib/server/services/naturalLanguageService.ts:2463-2495,2550-2567` · test: `naturalLanguageService.test.ts` › "explicit #tag wins over merchant keywords"
- Bill due cues, priority order: `due|by|starting|starts|on [(this|next)] <weekday>` (next ⇒ +7 days), `due|starting|starts tomorrow|today`, `due|starting|starts [in] N days|weeks|months`, `[due] [on|by] the Nth` (monthly rollover, day clamped), month-day with shared rollover, day-first, cued numeric `MM/DD` (month-strict; "40/15" resolves nothing and is passed through), `due|starting|starts next week|month` (month ⇒ 1st of next month) — `src/lib/server/services/naturalLanguageService.ts:2276-2364` · test: `naturalLanguageService.test.ts` › "parses \"due next friday\" as a week further out"
- Bill recurrence takes the shared cadence table first, then bill-only forms: `every <weekday>` ⇒ weekly and anchors the due date on that weekday, `/<unit>`, `per <unit>`, `a <unit>`, `each <unit>` for month/week/year; `frequency`+`interval` come from `valueToCadence`/`cadenceFrequency`, so "biweekly" stores weekly×2 — `src/lib/server/services/naturalLanguageService.ts:2367-2415` · test: `dateResolution.parsers.test.ts` › "quarterly is monthly x 3, in every parser"
- Bill amount priority: `$X` → `X dollars|usd|bucks` → bare leftover number (not followed by ordinal/meridiem/colon, and a bare 19xx/20xx year is skipped); amounts leave as integer cents guarded to the int4 ceiling, never float math; `amount` is cents/100 — `src/lib/server/services/naturalLanguageService.ts:2396-2420,2524-2545` · test: `naturalLanguageService.test.ts` › "does not read a year as an amount"
- Bill title preserves user words: only the `#tag`, due, recurrence and amount spans are removed, whitespace collapsed, trailing punctuation trimmed; known merchants (Home Depot, Lowe's, Walmart, Amazon) are canonicalized in place; null when nothing remains — `src/lib/server/services/naturalLanguageService.ts:2418-2460,2544-2557` · test: `naturalLanguageService.test.ts` › "merchant titles (#035)"
- The NLP regression gate is phrase-suite-driven: `naturalLanguageService.test.ts` holds 58 `describe` blocks and 244 `it`/`test` call sites across 2353 lines, with 4 `it.each` tables plus loop-generated cases (plural weekdays, hyphen meridians, glued article times, recurrence ends, location phrases, location-title spans, leading meridiem, catalogued ranges); `parserClaimGuards.test.ts` adds 12 disjointness cases, `dateVocab.test.ts` 36 vocabulary cases and `dateResolution.test.ts` the rollover/cadence rules — `src/lib/server/services/naturalLanguageService.test.ts`, `src/lib/server/services/parserClaimGuards.test.ts`, `src/lib/utils/dateVocab.test.ts`, `src/lib/utils/dateResolution.test.ts`
- The grammar split is the census contract: event/task/bill parsers each own a family and every cadence phrase added to one shared table lands in all three, proven by `dateResolution.parsers.test.ts` (33 cadence phrases × 3 parsers + rollover rows) — `src/lib/utils/dateResolution.parsers.test.ts:74-260`

### Page and UI behaviour worth keeping
- No page route is owned — the only user-visible surface is the parse result: the title comes back rebuilt from unmatched text, so consumed schedule/location words never appear in the quick-add title; if stripping empties it, the raw 50-char window comes back rather than a blank — `src/lib/server/services/naturalLanguageService.ts:1905-1990`
- A phrase naming several events returns a `results[]` list (route `method: "regex-list"`) so the caller can show one confirmable event per date, while a single event returns one object — `src/routes/api/parse-event/+server.ts:99-104`
- An unresolved `@member` in Task quick-add is surfaced as `unknownMember` for an inline error instead of being silently dropped or assigned — `src/lib/utils/taskQuickAdd.ts:553-561`
- Consumed `#tags`, `@handles`, priority/cadence/date words never remain in the Task title; an all-day event still comes back with 09:00–17:00 so the editor has times to show — `src/lib/utils/taskQuickAdd.ts:475-588`, `src/lib/server/services/naturalLanguageService.ts:2027-2030`
- The route's `method` field tells the UI whether the answer was cloud-parsed or regex-derived, and the route never spends vendor money for an Anonymous Account — `src/routes/api/parse-event/+server.ts:60-131` · test: `server.test.ts` › "never calls the paid LLM for unauthenticated callers, even when configured"

### Probably accidental (candidates to drop, owner to confirm)
- Any input containing "birthday" is forced to `allDay` (then 09:00–17:00); a birthday party at a stated time would still be all-day — `src/lib/server/services/naturalLanguageService.ts:1035-1039` — why: token is a noun cue, not an all-day phrase
- Weekly detection treats any weekday token ending in "s" as plural, so the valid singular abbreviations "tues"/"thurs" make a single event weekly — `src/lib/server/services/naturalLanguageService.ts:1120,1126` — why: "s" suffix is a poor plural signal for these tokens
- The `MM/DD` chain rule is unguarded: "party 31/12" hits `DateTime.invalid(...)` and writes the literal string "Invalid DateTime" into `date` — `src/lib/server/services/naturalLanguageService.ts:765-771` — why: the sweep guards `isValid`, the primary rule does not
- The claim book is consulted only by selected consumers (weekday scan, bare-weekday fallback, invite, calendar, at-my/on-address); recurrence, count, reminder and time rules read the unmasked `input`/`dateInput`, so #112's "one owner per span" is incomplete — `src/lib/server/services/naturalLanguageService.ts:505-526,1044-1608` — why: known STRUCTURE ticket #112, not intended design
- Time rules run on the raw `input`, URLs included, so a clock-like substring inside a URL can set `startTime` even though the URL is excluded from title/date scans — `src/lib/server/services/naturalLanguageService.ts:948-1608` vs `:483-487` — why: `nonUrlText` is used for dates but not for times
- The route's catch-all returns HTTP 200 with `method: "regex-fallback"`, hiding parse failures from callers — `src/routes/api/parse-event/+server.ts:135-137` — why: failure is reported as a normal success shape
- `await request.json()` runs before the `try`, so a malformed/non-JSON body escapes as an unhandled 500 instead of the route's 400 error shape — `src/routes/api/parse-event/+server.ts:67,96` — why: validation sits outside the error boundary
<!-- inventory:end -->

## Carry-over tickets

| ticket | class | policy |
|---|---|---|
| [#112](../../archive/issues/112-parser-claims-cannot-overlap.md) Route the whole 55-rule chain through the claim book; re-point the 272-test table. | STRUCTURE | keep behaviour; separate test-first ticket after the parsing port |
| [#188](../../archive/issues/188-ai-safety-gaps.md) AI prompt logs, injection delimiters, PII filter, eval harness. | SECURITY | keep; separate ticket |
| [#206](../../archive/issues/206-bug-report-batch-2026-10-25.md) "p.m." tokenization + second "at the y"; 500-class and mobile-nav repros. | BEHAVIOUR | keep behaviour; separate test-first NLP ticket |
| [#323](../../archive/issues/323-shared-parse-vectors.md) One dateVocab address; parse vectors drive both suites. | STRUCTURE | FIX-IN-PORT: the parsing module becomes the one address; vectors stay 145 in lockstep |

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# parsing: 0% ported

legacy source files left (4/4, 3183 LOC):
  - src/lib/server/services/naturalLanguageService.ts (2569 LOC, server) importers: 3
      NOTE: SPLIT inside parsing by grammar family (event, bill, segment, place, time) around the existing claim book. NLP rule: phrase tables stay green, test-first.
  - src/lib/server/utils/dateParsing.ts (61 LOC, model) importers: 2
  - src/lib/utils/dateResolution.ts (281 LOC, model) importers: 3
  - src/lib/utils/dateVocab.ts (272 LOC, model) importers: 3

route files not yet wiring-only (1/1):
  - src/routes/api/parse-event/+server.ts  /api/parse-event

legacy test files left (6/6) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/server/services/naturalLanguageService.test.ts [pure, 209 tests]
  - src/lib/server/services/parserClaimGuards.test.ts [pure, 12 tests]
  - src/lib/utils/dateResolution.parsers.test.ts [pure, 6 tests]
  - src/lib/utils/dateResolution.test.ts [pure, 15 tests]
  - src/lib/utils/dateVocab.test.ts [pure, 29 tests]
  - src/routes/api/parse-event/server.test.ts [route, 14 tests]
```
<!-- census:end -->
