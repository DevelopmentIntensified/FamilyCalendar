# 064 — Every family link in the app is a literal `{braces}` 404

Status: open

Source: found while grounding the family-prototype review (`app-ui/family.html`
marked the 404 "fix this then"), then widened: it is not one link.

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The families list card links to the family detail page by real id, not
      `href="/family/{family.id}"` — today every family in the list is a dead
      link, which is the primary way into the whole family area.
- [ ] The family detail page's members/add, tasks and invitations links resolve
      (two of them read an optional `family?.id`, so they can also render
      `/family/undefined/...`).
- [ ] The family invitations page's family link and members/add link resolve.
- [ ] The family tasks page's breadcrumb and back link resolve.
- [ ] The members/add page's breadcrumb and back link resolve.
- [ ] A guard lands so this cannot come back: a check that fails when a
      rendered `href` still contains a `{` (a template string that was never
      turned into one). The prototypes' own link check walks the tree; this is
      the in-app equivalent.
- [ ] `npm run build` green; the family e2e specs still pass.

## Done

## Notes

- Twelve occurrences across five routes. The invitations route and the
  members/add route both exist, so the fix is interpolation, not routing.
- `added_to_family` notification links build their link the same way — check
  it is not a thirteenth.
