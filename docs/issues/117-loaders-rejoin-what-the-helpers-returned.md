# 117 — Loaders re-join what the pure helpers already returned

Status: open

Source: architecture review, 2026-09-30, candidate #8.

**Blocked by:** None. Lowest confidence of the nine — verify each item before
acting, because some of this may be a judgement call about *where* the work
belongs rather than a defect.

## The finding

Three separate spots where a pure helper returns the right thing and the caller
reconstructs part of it:

- **`rankTop3`** returns bare rows; the loader **re-joins by id** to get names
  back. That is O(n²) lookups, and it leaves a silent hole: a rank can survive
  whose source row does not. A priority with no title is worse than a missing
  priority.
- **`layoutTimed`** returns correct percentages; `WeekHourGrid` re-derives
  top/height through its own helpers and adds `min-height:26px`, so the
  layout's clamp is **overridden by CSS** at short events. The module's decision
  is discarded silently.
- Calendar colour is built in **two places**, one of which hardcodes hexes.

## Needs doing

- [ ] **Verify each before fixing.** The hard part is the judgement: what belongs
      in the loader and what belongs in the module. A loader *is* a composition
      boundary. Moving work out of it is not automatically a deepening.
- [ ] `rankTop3` either returns what callers need, or the join is one
      documented, tested step. A rank without a title should not be possible.
- [ ] **Pick one owner for the min-height clamp.** Either the module says
      "never below 26px" or the CSS does. Today it is both, and CSS wins for
      reasons unrelated to the layout.
- [ ] Calendar colour has **one** source, and it holds no literals. Hexes in a
      component are a second palette that will drift.
- [ ] The loader's re-join, day-bucketing and colour assignment are tested
      **nowhere**. Whether the work stays in the loader or moves, the behaviour
      should be pinned.

## The judgement call

This ticket is the one most likely to be a false positive. "Loaders compose" is
what loaders are for. The bar for acting: **the loader contradicts the module**,
or **a caller can produce a state the module said was impossible.** The CSS
clamp is that, clearly. The `rankTop3` join is that. The colour duplication is
probably just duplication.

If an item does not clear the bar, close it with the reasoning here rather than
leaving it open.

## Done

## Notes

- Candidates 1–7 and 9 all share one root cause: an invariant that lives at the
  call site instead of behind an interface. 117 is the mildest instance of it.
