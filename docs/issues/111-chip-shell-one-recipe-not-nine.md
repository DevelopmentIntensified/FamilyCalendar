# 111 — The chip mark is deep; the chip around it is nine copies of a recipe

Status: open

Source: architecture review, 2026-09-30, candidate #6.

**Blocked by:** None.

## The finding

`ChipKindMark.svelte` landed last week and is a **genuine deepening**: one prop
pair (`kind`, `density`), full glyph + word + sr-only behaviour behind it, used
by nine views. That worked.

The shell around it did not. Nine views each hand-assemble:

```\nclassify → classes → style → decide label-vs-hint
```

Three copies of the "prefix the a11y phrase onto the hover hint" idiom, and
**one already forgot a fact**: `WeekAllDayRow.svelte:55` drops the calendar
attribution the other two carry. So the week all-day row cannot tell you which
calendar an event came from. Nothing failed — the copy just isn't identical.

## Two hazards that no test can see

- **Desync.** `chipSurfaceStyle` takes the **event** and re-derives the kind;
  `chipTreatment` takes the **kind**. Hand one a hand-computed kind and the
  other the event and they quietly disagree. The interface does not prevent it.
- **Stylesheet order decides the winner.** The overdue Task chip appends its
  border class *after* the vocabulary's, so which one applies is settled by
  Tailwind's generated CSS order — **not observable in a unit test at all.**

## Needs doing

- [ ] Fold the four helpers into one chip module. One call per view. The recipe
      becomes something you import, not something you remember.
- [ ] **The missing calendar name becomes impossible.** That is the acceptance
      criterion, not "fewer lines".
- [ ] One input shape for the whole module, so passing an event where a kind is
      expected is a type error rather than a desync.
- [ ] Surface precedence beats stylesheet order. If a border must win over the
      vocabulary's, say so in the returned classes, not in the class list's
      ordering.
- [ ] `WeekAllDayRow` gets its calendar attribution back, and the other eight
      views are diffed against it to find any second drift.

## The deletion test

Deleting `chipVocabulary` kills the "shape carries the kind, colour carries the
calendar" invariant — it earns its keep. Folding the shell into the same module
**concentrates**: the recipe collapses to one call and the lost fact cannot recur.

## Done

## Notes

- Nine views is past the point where a hand-composed recipe survives. Two or
  three copies is a pattern; nine is a convention with no enforcement.
- This is a pure-refactor ticket: no visual change intended. If a chip looks
  different afterwards, the priority order was load-bearing in a way nobody
  wrote down — record that here.
