# 030 — Event parse: multi-day spans + attendee split bugs

Status: done

## Done

- Fixed (commit 6849d15), 15 exact-phrase reds first, 19 new table
  cases (suite 334 → 353; full 1508 green):
  - Multi-day: "today" was never a date pattern; now feeds the
    explicit-dates chain (maximal run of date atoms joined by and/,/&,
    cap 5) → parsed.dates[] expansion (UI already fans out one event
    per date). Bare-meridiem times ("6am") now parse.
  - And-lists: with-list spans veto list-splitting — "with james and
    joseph" = both attendants on ONE event; genuine per-person lists
    still split ("dinner with sarah friday and movie with mike
    saturday").
  - Recurrence: "repeat every week"/"repeats weekly" patterns added →
    primary event recurrence + stripped from titles; terminal with-list
    and consumed location/till spans removed from titles.
- Mechanism note: expansion rides parsed.dates[] (not N-way
  parseEventList return — that would break 334 pinned contracts).
- Limitations: mixed weekday↔explicit chains ("today and friday") not
  chained; no-title cases fall back to raw phrase; trailing recurrence
  after a genuinely split list attaches to the last segment.
