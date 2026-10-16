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

- [x] **2026-10-16 (partial — the double-claims that existed are gone):** six
      live overlaps found red-first and fixed, each pinned in
      `naturalLanguageService.test.ts`'s new sibling
      `parserClaimGuards.test.ts`:
      1. *The two Date implementations had a third sibling.* The numeric
         `m/d` rules (first-match and sweep) still rolled against a
         midnight-vs-`now` comparison: `7/15` typed **on** Jul 15 booked
         2027 while `jul 15` stayed today. Both now call the shared
         `withRolloverYear` — `sept 1` has one answer, and so does `9/1`.
      2. *`jun`/`jul` were absent from MONTH_ALT* (though present in the
         index maps): `jul 14` was not a date in the event/bill parsers while
         `july 14th` and the task quick-add both parsed it. Vocabulary gap
         fixed in `dateVocab.ts`; the dateVocab pin asserting the omission
         flipped; the event parser's hard-coded ordinal-sweep month list
         now reads MONTH_ALT instead of its own copy.
      3. *One year-shaped candidate vetoed the compact-time rule entirely:*
         `standup 2026-08-30 1830` lost `1830` because the single
         `.match()` stopped at the claimed `2026`. The rule now skips a
         claimed candidate and keeps scanning.
      4. *The place reader walked through the date rule's words:*
         `at the annex this friday` read place `annex this`. The place
         terminator set now ends at `this`/`that` exactly as it did at
         `next`/`last`.
      5. *The bill amount family ate half of a cued numeric date:*
         `water bill on 8/15` was an $8 bill titled `water bill on /15`
         with no due date. The due step now claims `on|by m/d` whole.
- [ ] Remaining: the 55-rule chain is still a linear priority chain
      guarded by `!result.date`/`foundTime` feature guards, not a span
      claim book; the ~272-test table still aims at outputs, not at a
      claim seam; `inviteMatch` keeps its own partial terminator list
      (deliberately — `and` splits its names, so the shared place list
      does not transfer). These are the same seam, unfinished.

## Notes

- The Location cluster is 120 lines behind **5 tests** in the current suite. The
  imbalance between implementation size and test count is itself a finding.
- A silently-wrong location is worse than no location. 108 says so; this ticket
  is why that class should stop existing.
