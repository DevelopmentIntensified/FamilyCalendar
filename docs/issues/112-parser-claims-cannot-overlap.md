# 112 — The event parser's rules fight over one string; make claims non-overlapping

Status: open

Source: architecture review, 2026-09-30, candidate #2 — the most user-visible
bug class.

**Blocked by:** 108 is adjacent and may already land part of this. Check 108's
`Done` first and do not duplicate its span fix.

## The finding

`parseEventInput` spans **lines 397–1793: ~55 regex rules in a linear priority
chain.** Every future bug is a new rule appended, not a change in one place.

The module is already *deep* — four exports for 2,345 lines is good leverage.
What it lacks is **locality**, and the failure mode is mechanical:

```\nlocation, title, and attendee all read the same text
each subtracts its own span, in a fixed order, using double-space sentinels
```

So the rules cannot see that they are overlapping, and one rule's span
sabotages the next. 108 is one instance of this exact shape.

**A second, quieter instance:** the Date cluster is implemented **twice** with
**different rollover** — one rolls only when month ≤ now, the other always.
`sept 1` gets two answers depending on which pass runs first.

## Needs doing

- [ ] **Claims become non-overlapping.** Each rule claims a span of the input;
      later rules cannot see claimed text. A rule that would overlap is skipped,
      not applied anyway.
- [ ] **One place decides what terminates a phrase.** `on`, `at`, `from`, and
      the existing conjunction list, defined once. Today each rule carries its
      own partial list.
- [ ] Collapse the two Date implementations onto one, or prove with a test that
      they are genuinely different concepts. `sept 1` must have one answer.
- [ ] Re-point the existing ~272-test phrase table at the claim layer. The
      coverage is already good; it is aimed at the wrong seam. **The table is the
      floor, not the ceiling** — per the repo's NLP rule.
- [ ] A new phrase family gets its own exhaustive table, not one regression test.

## What must not change

The **interface**. Four exports, small and deep, is right. This is about where
the complexity lives inside the module, not about what callers learn. If a caller
starts passing a claim set, the seam got shallower, not deeper.

## The deletion test

Deleting the module moves ~1,396 lines into three or four call sites. It is not
pass-through. It is **too deep in the wrong place** — the seam shape, not the
size, is the problem.

## Done

## Notes

- The Location cluster is 120 lines behind **5 tests** in the current suite. The
  imbalance between implementation size and test count is itself a finding.
- A silently-wrong location is worse than no location. 108 says so; this ticket
  is why that class should stop existing.
