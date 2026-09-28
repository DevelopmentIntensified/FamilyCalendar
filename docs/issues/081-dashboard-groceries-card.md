# 081 — Dashboard: groceries replaces the parked meals card

Status: open

Source: `app-ui/dashboard.html` review, meals marked **bad** — "remove for now.
add groceries here".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The dashboard has a groceries card: what is on the list, how many items
      are still open, and the stores it spans.
- [ ] The card links into the groceries page, filtered to the relevant scope.
- [ ] The parked meals card is gone from the dashboard prototype, and the
      prototype's copy about meals being half-wired stops claiming a card that
      no longer exists.
- [ ] A dashboard card that has nothing to show says so and stays quiet, rather
      than rendering an empty box.
- [ ] Tests for the card's populated, empty and hidden states; the dashboard
      module suite covers it as a module the family can switch off.

## Done

## Notes

- The meals table, its API and its card are parked in place by user directive;
  this removes the *dashboard prototype's* copy of the parked card. Do not
  delete the parked code.
- The account page still shows a Meals toggle that switches nothing. That is
  its own ticket if it is still true after this lands.
