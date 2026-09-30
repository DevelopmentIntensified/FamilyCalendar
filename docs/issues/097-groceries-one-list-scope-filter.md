# 097 — Groceries: both scopes at once, with a filter row

Status: done

Source: `app-ui/groceries.html` review, the two-tabs model marked **idea** —
"I want them both to display at the same time like tasks with filters instead."

**Blocked by:** 096 (the filter row is where the store colours and the search
live; build the row once, then hang both on it).

## Needs doing

- [x] Both scopes render in one list. The two scope tabs are gone; a scope
      filter replaces them, carrying the same counts the tabs carried. The
      `role="tablist"` is gone; the filter uses the tasks page's idiom exactly
      — single-select chips with `aria-pressed` over ONE list
      (`TaskToolbar.svelte`). Counts read `All 6 / Family 4 / Mine 2`.
- [x] Every row still says which scope it belongs to, and the distinction is
      never carried by colour alone — a group can hold items from both scopes
      and the reader must be able to tell them apart. Every row carries a
      `MINE` / `FAMILY` word tag on a plain grey background. It is deliberately
      **not** a colour: 096 made colour mean "which store", so reusing a hue
      for scope would overload the one channel the store colours just defined.
      Pinned by a test that walks every row in the list.
- [x] The default is **all scopes**, so the page opens on everything rather
      than on one scope the user then has to switch away from.
- [x] A small search on the filter row, matching the tasks page: one bound
      field, matching on the item name and on the store, with a "Searching X"
      line and a clear affordance. `matchesGrocerySearch` in
      `$lib/data/groceries.ts` has the same shape as the tasks page's
      `matchesSearch` (bound `searchQuery`, trim + lowercase, empty matches
      all) and lives in the same pure, client-safe module as the rest of the
      grocery model. Search is a filter over what is already loaded, not a new
      request: both scopes are on the page, so there is nothing to fetch.
- [x] The add field posts to an explicit scope, and the scope it will use is
      visible on the form — not inferred from a tab that no longer exists. The
      new row lands in that scope and the toast says which. `Add to` is a
      labelled select; the toast reads `Added "Butter" to Mine.`
- [x] The Store Memory suggestion is fetched for the scope the add form is
      pointed at, and the chip says so, rather than silently answering for the
      other list. `lookupSuggest` reads `addScope`, not the filter.
- [x] The "Checked off" rail holds everything checked this session across both
      scopes, and each uncheck still acts on the scope the item actually came
      from. The rail is no longer filtered by a tab, and each entry carries its
      scope tag so a "put back" is unambiguous.
- [x] "Move to Family" / "Move to Mine" still works and still names the
      destination; the row changes scope in place instead of needing a tab
      switch to be seen. The destination is derived from the ROW
      (`scopeOf(item)`), not from the filter, so "To Family" is never a no-op
      on a personal row.
- [x] The "no family yet" message still appears, and now reads as a statement
      about the family scope rather than about the page: `No family yet — join
      or create one to use the shared list.`, shown whenever the family scope
      is in play and not shown on the Mine filter.
- [x] The page test is rewritten, not deleted: the filter (default, counts,
      switching), the cross-scope grouping, the search, the add scope, the
      checked-off rail across scopes, and the move action. The 074 tab suite
      was **replaced** by the filter suite, and every surviving 074 assertion
      (grouping, summary, chip, check-off, uncheck, error region, row actions,
      Store Memory chip) was kept and re-pointed at the new default.

## Done

- [x] The filter, the search and the add-scope control in the side rail, with
      the same markup idiom as `FamilyTaskFilterBar.svelte`.
- [x] Every row action now reads its scope from the row
      (`scopeOf(item) === 'family' ? 'family' : 'mine'`) rather than from a
      tab: check, uncheck, save stores, move, delete.
- [x] 20 new page tests; the suite is 48.
- [x] `npm run build` green; both vitest projects green; no new `svelte-check`
      errors in the files touched.

## Notes

- **This reversed the tab design 074 just shipped, and it is a change, not a
  restyle.** 074's acceptance criteria about tab order and tab counts are
  rewritten here, not preserved. What survives of 074 is the layout (the
  two-column grid, the rail), the grouping, the summary line, the chip, the
  checked-off rail, the row actions and the Store Memory chip.

- **The grouping decision, which the ticket asked me to make explicit: the
  group is per STORE, not per (scope, store).** A shop is a shop and you make
  one trip to it; splitting "Aldi" into a family Aldi and a personal Aldi
  fragments the trip shape that grouping exists to express, and — decisively —
  it would put the same store colour in two group headers on one page, which
  makes the colour mean less, not more. So a group carries both scopes inside
  it and the summary line counts the group honestly: Aldi reads
  `3 items · 7 total` for a family item, a family item with an alternate, and
  a personal one. The scope rides on the row, in words.

- **What happens to a user who had picked a tab: nothing is lost, because
  nothing was stored.** The old tab was client state, initialised from
  `?scope=` and never persisted — there is no `localStorage` key, no server
  column, no cookie. So there is no migration to write and no stale preference
  to clear. Two real consequences, both covered by tests:
  1. **The default flipped from Family to All.** A user who landed on the page
     without a parameter used to get the Family list; they now get both. That
     is the reviewer's explicit ask ("both to display at the same time"), and
     the Family chip is one tap away.
  2. **`?scope=mine` still lands on Mine.** The dashboard's per-scope card link
     passes the parameter and the page reads it on load; it now selects the
     FILTER rather than the tab, and junk falls back to `all` rather than
     showing nothing. The promise "a Mine → link does not land on the wrong
     list" is intact — a test asserts the family list is genuinely absent.

- **The add form's scope follows the filter only when the filter names one
  scope.** Clicking `Family` or `Mine` points the add form at that scope, so
  the two cannot silently disagree — the common case (filter to Family, add
  bread) does the obvious thing. `All` does not override an explicit choice,
  because `All` names no scope and clobbering the user's pick would be worse
  than leaving it. The `Add to` control is always visible and always says what
  it will do, so this is a convenience, never a hidden inference.

- **096's colour resolution survived the reversal untouched, by design.** It
  was built to be by VIEWER, not by which tab is open, precisely so this
  ticket could land without touching it. `resolveGroceryColours` is keyed by
  the group label as written, so the filter view reads a colour straight off a
  group with no re-normalising.

- **A group that mixes scopes can now also mix colours honestly.** 096's
  header already read `… · shares Sage with Trader Joe's`; with both scopes on
  one page that clause is doing more work, since the two stores named may sit
  in the same group or in different ones.

- The checked-off rail was deliberately session-scoped (client state) because
  only unchecked items are read back. That decision is unaffected and was not
  reopened here.
