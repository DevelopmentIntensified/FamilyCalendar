# 080 — Dashboard: the verse leaves the module band

Status: open

Source: `app-ui/dashboard.html` review, daily verse marked **bad** — "too big and
shouldn't be part of the dashboard section, should be above in the more
utils/info section".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The verse moves out of the toggleable dashboard module band into an
      info band above it, and gets smaller.
- [ ] The verse's module switch changes meaning with it: it now controls
      whether the verse shows at all, not whether a band renders. Existing
      users' saved switch states keep working.
- [ ] The info band is quiet: the verse is a reading, not a task.
- [ ] The card's own tests stay green; the dashboard module suite covers the
      moved card's visibility.
- [ ] The prototype's module band shows the verse above it, matching the app.

## Done

## Notes

- The verse is already duplicated in spirit by the calendar page's verse, so
  this also reduces the sense that the dashboard is "eight cards competing"
  — the prototype's own question.
- The module list is shared with the family settings switches (077). Change
  the meaning in one place.
