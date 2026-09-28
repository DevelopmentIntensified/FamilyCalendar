# 076 — Create a family: members before the finish line

Status: open

Source: `app-ui/family-create.html` review — "a family created with nobody in it
is an empty shell, so members come before the finish line". The structural half
of the approved page.

**Blocked by:** 075 (the approved create page lands first; this adds behaviour
to it).

## Needs doing

- [ ] "Who is in it" on the create page: pick from existing users, with a
      running count against the family's member limit and a way to add someone
      new. Reuses the existing family search endpoint rather than a new one.
- [ ] The create action reads the chosen members, inserts them alongside the
      creator, and does it in **one transaction** with the family and its
      calendar — the three inserts are not atomic today, so a failure leaves a
      half-made family.
- [ ] The member limit is enforced on the server, not just in the picker.
- [ ] Role and member type are set correctly for every row added, and the
      creator keeps the creator role.
- [ ] The picker is testable without a browser at the boundary that matters:
      the action's form parsing, limit enforcement and rollback.
- [ ] The "what happens next" panel tells the truth after the change — where
      you land, and what the empty shell argument now means.
- [ ] The e2e spec covers a create with members and a create that hits the
      limit.

## Done

## Notes

- A child is a family member with a user row, so "create a child" from this
  page means creating accounts inside the create action. That is a deliberate
  consequence, not an accident — decide whether it belongs here or stays on
  the members/add page, and say so in the issue when it lands.
- Family creation e2e specs exist and assert the current shape; extend them.
