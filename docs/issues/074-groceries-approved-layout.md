# 074 — Groceries: the approved layout, on the real page

Status: open

Source: `app-ui/groceries.html` review — "prototype approved".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The real page takes the approved prototype's layout: two columns on wide
      screens (list plus a side rail), store groups with a summary line
      (item count and total quantity), and the two-scope tabs carrying counts.
- [ ] Store Memory surfaces as suggestion chips under the add field instead of
      placeholder text, and the store chip on each row carries its alternates
      (the "or X" line).
- [ ] Items read as a trip: a square check box, the item struck through once
      checked, and the store grouping sorted so the list scans alphabetically
      rather than by insertion order.
- [ ] The tab default and its order match the approved prototype.
- [ ] Everything the real page already has and the prototype stubs survives the
      restyle: editing an item's stores, moving it between Mine and Family,
      deleting it, the error region, the "no family yet" message, per-item
      alternates, and the instant check-off.
- [ ] A page test covers the grouping, the tabs and the check-off; the
      grouping helper's suite grows the sorted-order case.
- [ ] No horizontal overflow at 320px.

## Done

## Notes

- This is a **restyle, not a rewrite**: grouping by store, the two tabs, store
  memory and the optimistic check-off are all already built. The judgement
  calls are store ordering, tab default, and turning the suggestion endpoint's
  answer into chips.
- Uncheck exists server-side with no UI. If the restyle surfaces it, good;
  if not, it is a separate ticket.
