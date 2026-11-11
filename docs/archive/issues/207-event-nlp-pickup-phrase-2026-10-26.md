# 207 — Event NLP: "pick up isaiah at 8:00 p.m. for swimming at the y" (2026-10-26 export)

Status: done

Source: unmatchedPhrases export 2026-10-26 (1 unique, first seen 2026-10-26). Same workflow as #204 (table-driven TDD in `naturalLanguageService.test.ts`, floor is 577 tests).

Matched:
```
{"startTime":"08:00","location":"y","attendants":"[\"Isaiah\"]","title":"Pick up Isaiah p.m. for swimming","date":"2026-10-25"}
```

## Defects

1. `p.m.` (with periods) is not tokenized as a time suffix — the hour landed (`08:00`) but the trailing `p.m.` stayed in the title as `Pick up Isaiah p.m. for swimming`. The bare-`6:30pm` class (#204) and bare leading-`pm` class (#107) are covered; the `p.m.`-with-periods variant is not.
2. The second `at the y` should produce location `y` (a proper place suffix after `for swimming at the <place>`), leaving the FIRST `at`-clause's `y` not duplicated in title or location; currently `y` landed (possibly from the first `at`) and the second `at the y` stayed unmatched/stranded.
3. Expected title: `Pick up Isaiah for swimming` — no `p.m.`, no stray `at the y`.

## Needs doing

- TDD: RED table-driven tests in `naturalLanguageService.test.ts` covering at least the exact phrase + variants (`8:00pm`, `8pm`, `8:00 p.m.`, `for swimming at the ymca`, `for practice at the y`, `at the ymca` as suffix, second-location capture when two `at <place>` clauses appear).
- GREEN: fix parser (likely `p.m.`/`a.m.` period-tolerant time suffix + a second location-suffix rule for `at the <place>` after a preceding location or activity word).
- Keep existing 577+ coverage green; do not weaken #107/#204 tests.

## Done

GREEN 2026-10-25 evening, TDD. RED was 4 fail / 1 pass (5-row table), then the
table grew to the ticket-enumerated floor before ship. Owner directive widened
the surface mid-review: **a.m./p.m. accounted for everywhere**, not just the
at-form.

- `normalizeMeridiem(period)` added to `dateParsing.ts` — strips dots/spaces
  ("p.m.", "a. m.") down to `pm`/`am`; bare partials ("p") keep the old
  no-adjustment behavior.
- Capture sites extended with the dotted fragment `(?:[ap])\.?\s?m\.?(?![a-z])`
  + normalized: the `at`-form (1356), standalone colon form (1364, single
  letter `7:15P` preserved), bare meridiem form (1369), hyphen range (1066),
  from/to range (1088 — was dotted-aware but `applyPeriod` never applied
  `p.m.` → now normalized), between range (1108), bare range (1131), and the
  colloquial forms ("half past seven p.m.", 1431).
- Title strips (`TITLE_TIME_RES`) + place guard (`PLACE_TIME_GUARD`) gained
  dotted rows; `8-10 p.m.` no longer leaks into titles; the range title-strip
  row also carries dotted meridiem on both ends.
- Suites: naturalLanguageService 608/608 (577 floor + 31 new table rows/pins),
  parserClaimGuards 6/6, full build green, ssr-render-inner check clean.
- Code-review (two-axis, 8857b02...7888049) findings addressed: the standalone
  regex rewrite had narrowed away `7:15P` — restored `[ap]m?` + pinned by a
  regression row; exact titles pinned from probe actuals; the meridiem
  fragment is hand-copied across the regex constants — extraction to one
  shared fragment is the noted residual smell (not done; regex-literal churn
  deferred to #197's compiler work).

Residue (not in scope, on record): dotted meridiem on the "between 2 and 4"
form's START period only inherits via normalize; "quarter to nine p.m."
edge arithmetic unchanged. #206's feature-request class is untouched here.
