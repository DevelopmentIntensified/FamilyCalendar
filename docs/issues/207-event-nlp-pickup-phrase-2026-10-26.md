# 207 — Event NLP: "pick up isaiah at 8:00 p.m. for swimming at the y" (2026-10-26 export)

Status: open

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

- (none yet)
