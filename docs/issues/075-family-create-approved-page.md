# 075 — Create a family: the approved page, on the real page

Status: open

Source: `app-ui/family-create.html` review — "passed". Prototype approved.

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The real page takes the approved prototype's composition: a live preview
      of the family as you name it, the name field as the loudest thing on the
      page, the colour choice explained rather than just offered.
- [ ] The swatch set is the prototype's curated earthy set, not seventeen
      arbitrary hexes in a six-column grid.
- [ ] Copy: "What do you call it?" and a plain explanation of what the colour
      is for, replacing "max 50 characters" as the visible instruction.
- [ ] Usage line showing how many families are used against the plan limit, so
      the upgrade banner stops being the only signal.
- [ ] The create still acks in under 100ms and confirms what happened (toast
      plus the redirect), per the UI rules.
- [ ] The existing family creation e2e spec is updated, not deleted: the
      heading, the name field, the button, the error box, the redirect, and
      the default colour all still have to hold.

## Done

## Notes

- This is the **presentational** half of the approved page. The structural half
  — picking members before the finish line — is 076 and needs its own window.
- The create action is three separate inserts and is not atomic. If 076 is
  touching it, take the transaction there rather than here.
