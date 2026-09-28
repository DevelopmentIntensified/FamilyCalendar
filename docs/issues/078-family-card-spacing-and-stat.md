# 078 — Family card: room to breathe, and one more thing to say

Status: open

Source: `app-ui/family.html` review, family card marked **bad** — "add margins,
give space around it", plus the idea "add some other stat".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The family card has margins: it does not sit flush against its
      neighbours, and its contents have room to breathe.
- [ ] The card says one more thing beyond member count and the plan-usage pill
      — pick the stat that answers "is this family actually in use" (upcoming
      this week, open tasks, last activity).
- [ ] The new stat is a single cheap query in the loader, not one per card.
- [ ] The card is the primary route into the family, so its link is real —
      see 064, which this card is the worst-affected instance of.
- [ ] The empty state and the invitations card keep their current spacing
      rhythm.

## Done

## Notes

- The plan-usage pill is a prototype detail; the real page has the upgrade
  banner. Keep the pill idea only if the real page can back it with data.
- Fix 064 first or in the same slice — a restyled dead link is still a dead
  link.
