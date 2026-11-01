# 220 — Events fetched for other months never refresh after a mutation

Status: open

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/components/calendar/Calendar.svelte:211-215` `mergeFetched` appends to `remoteEvents`; nothing clears `remoteEvents`/`rangeLoaded`; mutations only `invalidateAll()` (page-load month).

## Repro

Navigate to next month, edit/delete/drag/RSVP an event -> stale chip until hard reload; a newly created event there flashes then vanishes.

## Done

(none yet)

## Needs doing

- After any mutation reset `remoteEvents`/`rangeLoaded` and refetch the month on screen (e.g. refreshKey bumped after invalidateAll).
- Red test first where a seam exists (`tdd`).
