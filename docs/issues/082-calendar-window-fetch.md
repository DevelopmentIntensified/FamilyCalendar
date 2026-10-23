# 082 — The calendar only ever loads the month it was asked for

Status: open

Source: bug report 2026-09-27 — "Import not adding events in future months
beyond current".

**Blocked by:** None (can start immediately).

## Needs doing

- [x] The calendar fetches the window it is about to show. Today the server
      loads only the visible month and month navigation is client-side, so a
      navigated-to month has no data — which is why imported events appear
      nowhere while events created in the app do (they ride the optimistic
      local list). **LANDED 2026-10-22** — `GET /api/events?from=&to=` was
      already served (`src/routes/api/events/+server.ts`, #126); the client
      now calls it on month move: `Calendar.svelte` fetches the on-screen
      month via the `loadRange` prop wired by `+page.svelte`.
- [x] A ranged read endpoint over the user's accessible calendars (already
      existed — #126 port).
- [x] Moving to a month that is not loaded fetches it, merges it into the
      calendar (dedup on masterId+occurrence key), and shows a pending state
      ("Downloading this month…", `calendar-range-pending`). **LANDED
      2026-10-22**, pins in `Calendar.svelte.test.ts` #082 describe.
- [x] Moving back and forth does not re-fetch what is already held, and the
      cache is bounded (twelve months, oldest evicted). **LANDED**.
- [ ] The import success screen links to the first imported date, so an import
      that landed in another month is verifiable.
- [ ] Tests: the endpoint's range (covered in `api/events/server.test.ts`) and
      its auth scope (personal + family, nothing else) — auth 401 covered,
      scope still needs a pin. Client merge/cache behaviour covered in the
      #082 describe.

## Done

- Client half painted 2026-10-22 (TDD, red→green in one suite): fetch-on-
  month-move + pending + merge-dedup + bounded cache + failure toast in
  `src/lib/components/calendar/Calendar.svelte` (RANGE_CACHE_MAX = 12);
  `+page.svelte` wires `loadRange` (fetch `/api/events?from=&to=`, colour by
  calendar scope) and `loadedMonths` = the SSR window (today or ?date=), so
  the page-load month is never refetched.


## Notes

- Re-open this with the reporter's example .ics file before assuming the
  endpoint is the whole fix — the file may carry a shape the parser drops.
  Ask for it out of band; the report form takes no attachment.
- Do not widen the page load back out to ±2 years. That regresses the load
  perf work (TTFB and payload both landed there).
