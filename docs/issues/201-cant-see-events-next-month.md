# 201 — Can't see events in next month

Status: open

Source: user bug report, https://www.familyplanz.com/report-bug, 2026-10-22 19:37. Exact repro window/session unknown — no report id page host recorded; the reporter hit /calendar during today's SSR outage, so first check is whether the 5.57-era artifact fixed this and it was deploy-filtered, or it reproduces on a junk-cookie 200 session.

## Done

- **2026-10-22 Done (client half of #082):** `Calendar.svelte` (`loadRange`/
  `loadedMonths` props, guarded re-fetch, 12-month `RANGE_CACHE_MAX` bound)
  wired by `(calendar)/calendar/+page.svelte:46` — moving to an unloaded month
  now fetches `/api/events?from=&to=`, merges with dedup, shows pending state.
  Test-env `loadRange` caching pins in `Calendar.svelte.test.ts` #082 describe.
  Cache-bound unit test + `/api/events` auth-scope pin + import-first-date link
  + live verify still owed (kept in #082/#201 Needs doing). Ticket stays open
  until #082's remainder ships and live verification lands.
- Root cause diagnosed 2026-10-22: it IS #082. The page load covers one month
  (`monthGridWindow` at `src/routes/(calendar)/calendar/+page.server.ts:44`,
  expansion at :266-267) and month navigation in the client never fetches:
  `goNext`/`goPrevious`/`handleMonthSelect`/`handleYearSelect` (`src/lib/components/calendar/Calendar.svelte`)
  only mutate the `currentDate` store. Nothing calls `GET /api/events?from=&to=`
  anywhere — confirmed by repo-wide fetch search. A month beyond the opened
  window therefore has no data at all, not a rendering/parse bug.
- #082's client half LANDED the same day (fetch on month move, pending state,
  merge dedup, bounded cache — see 082). Close this into #082 once it ships.

## Needs doing

- Verify the fixed behaviour on test.familyplanz.com after #082 deploys (happy
  path: create or import one event in a future month, navigate to it).
- Confirm the reporter's original session was the SSR-outage 5.57 artifact, or
  chase junk-cookie 200 repro if it persists on the fixed deploy.
