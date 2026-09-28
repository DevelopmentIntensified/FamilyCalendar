# 082 — The calendar only ever loads the month it was asked for

Status: open

Source: bug report 2026-09-27 — "Import not adding events in future months
beyond current".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The calendar fetches the window it is about to show. Today the server
      loads only the visible month and month navigation is client-side, so a
      navigated-to month has no data — which is why imported events appear
      nowhere while events created in the app do (they ride the optimistic
      local list).
- [ ] A ranged read endpoint over the user's accessible calendars, covering
      personal and family, recurring masters expanded, exceptions and RSVP
      status attached — the same pipeline the page load uses, not a second
      dialect of it.
- [ ] Moving to a month that is not loaded fetches it, merges it into the
      calendar, and shows a pending state rather than an empty grid.
- [ ] Moving back and forth does not re-fetch what is already held, and the
      cache is bounded.
- [ ] The import success screen links to the first imported date, so an import
      that landed in another month is verifiable.
- [ ] Tests: the endpoint's range, its auth scope (personal + family, nothing
      else), and the client's merge/cache behaviour.

## Done

## Notes

- Re-open this with the reporter's example .ics file before assuming the
  endpoint is the whole fix — the file may carry a shape the parser drops.
  Ask for it out of band; the report form takes no attachment.
- Do not widen the page load back out to ±2 years. That regresses the load
  perf work (TTFB and payload both landed there).
