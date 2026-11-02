# 220 — Events fetched for other months never refresh after a mutation

Status: done

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/components/calendar/Calendar.svelte:211-215` `mergeFetched` appends to `remoteEvents`; nothing clears `remoteEvents`/`rangeLoaded`; mutations only `invalidateAll()` (page-load month).

## Repro

Navigate to next month, edit/delete/drag/RSVP an event -> stale chip until hard reload; a newly created event there flashes then vanishes.

## Done

- `Calendar.svelte`: fetched rows now kept per month (`remoteByMonth`), a refetch replaces that month wholesale. A fresh `events` prop (every mutation ends in `invalidateAll()` -> new page data) triggers `invalidateRemote`: bump `rangeGen`, clear `rangeLoaded`/`rangeBusy`, drop other months, keep the on-screen month's rows drawn until the refetch lands (no empty flash); the existing guard refetches the month on screen. In-flight fetches from an older generation are discarded. Eviction past 12 months now also drops that month's rows. Merge dedupes across months via `mergeRemote`.
- Covers edit/delete/drag/RSVP/duplicate/create in any view, since all funnel through invalidateAll.
- Tests (`Calendar.svelte.test.ts`): `refetches the remote month on screen after an edit / a delete reloads the page data`. Red: loadRange called once, stale "Harvest" kept -> green. Existing #082 cache tests unchanged and green; calendar+utils+api/events suites 1381/1381.

## Needs doing

(none)
