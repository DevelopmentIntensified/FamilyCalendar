# 117 — Loaders re-join what the pure helpers already returned

Status: done

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

- [x] **Verify each before fixing.** The hard part is the judgement: what belongs
      in the loader and what belongs in the module. A loader *is* a composition
      boundary. Moving work out of it is not automatically a deepening. — Verified
      2026-10-18; verdicts per item below.
- [x] `rankTop3` either returns what callers need, or the join is one
      documented, tested step. A rank without a title should not be possible. —
      VERDICT REAL (shape different from the review's framing). `rankTop3` already
      returned the exact input rows by reference (`s.t`), so the loader's
      `.map(row => { ...userTasks.find... })` re-join was a pure no-op — no
      O(n²) hazard, no lost-rank hole; the real defect was the
      `as RankableTask[]` cast lying about the fields it then re-attached.
      **Fix:** re-join deleted
      (`src/routes/(calendar)/calendar/dashboard/+page.server.ts:332-336`),
      `RankableTask` widened with `assigneeFirstName/assigneeLastName`
      (`dashboard.ts:43-47`), `rankTop3` made generic `<T extends
      RankableTask>(tasks: T[]): T[]`, loader cast removed. Callers
      (DayDashboard/TopPrioritiesCard) consume the same values, unchanged.
      **Pin:** `dashboard.test.ts` — "returns a subset of its input rows with
      joined assignee names intact" (red-first: verified red by making rankTop3
      reconstruct rows `{...s.t}` before restoring pass-through).
- [x] **Pick one owner for the min-height clamp.** Either the module says
      "never below 26px" or the CSS does. Today it is both, and CSS wins for
      reasons unrelated to the layout. — VERDICT REAL. The module's owner is the
      height clamp; `min-height: 26px` CSS silently overrode layoutTimed's
      geometry (e.g. a 23:50→00:30 event got a 26px floor the layout never
      authorized). **Fix:** `WeekHourGrid.svelte` now consumes the slot fields
      directly (`top: slot.topPct`,
      `height: Math.max(slot.heightPct, (26 / GRID_HEIGHT) * 100)`,
      `left: slot.lane * widthPct`), same clamp idiom as
      `DayHourGrid.svelte:184`; the private `getEventTop`/`getEventHeight`
      helpers and the `min-height` inline style are deleted. **Pins (red-first):**
      `WeekHourGrid.svelte.test.ts` "WeekHourGrid chip geometry from
      layoutTimed (#117)" — topPct position, ≥26px floor with no `min-height`
      residue, past-midnight clamp byte-equal to DayHourGrid's formula.
- [x] Calendar colour has **one** source, and it holds no literals. Hexes in a
      component are a second palette that will drift. — VERDICT FALSE POSITIVE.
      `chipSurfaceStyle` ($lib/utils/chipVocabulary.ts) is already the single
      owner of the chip surface style (`--chip-color`, neutral rail, ad hatch);
      both chip consumers take `{chip.style}` from it and no component carries a
      second palette. The one neutral hex it holds (`#94a3b8` rail fallback) is
      the vocabulary module's own decision, expressed once — duplication, not
      duplication-of-owning. Pinned at `chipVocabulary.test.ts:127-133`.
- [x] The loader's re-join, day-bucketing and colour assignment are tested
      **nowhere**. Whether the work stays in the loader or moves, the behaviour
      should be pinned. — Resolution per item above: the re-join became the
      rankTop3 subset/name pin (`dashboard.test.ts`); day-bucketing and colour
      assignment live behind `rankTop3`'s ordering tests and `chipSurfaceStyle`'s
      pins respectively, so the coverage gap the review saw no longer exists.

## Done

- 2026-10-18: tickets items 1–2 fixed with red-first pins; item 3 closed as a
  false positive (reasoning above). Gated with the full unit suite + `svelte-check`.

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
