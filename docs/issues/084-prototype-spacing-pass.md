# 084 — Spacing pass on the prototypes nobody has reviewed

Status: open

Source: instruction — go through the prototypes with no notes and make sure
things have sufficient margins, are not touching, and stay compact but relaxed.

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] Every prototype page with no review notes gets a spacing pass. That is
      the account, archive, event, family-invitations, family-members-add,
      family-tasks, import, models and stats pages, plus the current, focus
      sidebar and day-first calendar pages.
- [ ] Nothing touches: siblings in a stacked flow get a real gap, containers
      get real padding, and no two bordered blocks sit flush.
- [ ] Compact but relaxed: no band grows for the sake of air, and no band is
      squeezed to save it. Density up, breathing room kept.
- [ ] The pass is **measured, not eyeballed** — a browser has not been
      attached for this work, so spacing claims come from real geometry
      (element boxes, gaps, padding) rather than from reading the CSS.
- [ ] A spacing check lands as a permanent guard, in the same spirit as the
      existing tree/serve/lint suites, so the next pass has a floor to check
      against rather than a fresh opinion.
- [ ] The tree, serve and per-set check suites still pass; the pages that
      reproduce a real defect still reproduce it (spacing is not a licence to
      smooth a bug over).

## Done

## Notes

- Ground rule 7 of the prototypes: defects in the real app are shown, not
  smoothed over. A page that is cramped *because the app is cramped* stays
  cramped until the app is fixed — fix the app in its own ticket.
- Twelve pages. This is a wide, shallow change: same class of edit everywhere,
  so it lands as one slice with the checker as its acceptance gate, not as
  twelve tickets.
