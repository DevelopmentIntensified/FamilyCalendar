# 225 — Bulk bar: Enter in empty Location clears location on all selected events

Status: done

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`BulkEditBar.svelte` Location input onkeydown Enter -> `onRunBulk({type:'location', location: bulkLocation})` unguarded (button is disabled when empty); server stores `location || null`.

## Repro

Select 5 events, focus Location, press Enter -> all 5 locations wiped, success toast.

## Done

- `BulkEditBar.svelte`: Enter and the Set button both call `runLocation()`, which applies the button's guard (busy / no selection / `!bulkLocation.trim()`).
- Tests (`BulkEditBar.svelte.test.ts`): `Enter in an empty Location ("") / ("   ") does nothing (#225)` red (onRunBulk called with location '') -> green; `Enter in a filled Location sets it (#225)` guard.

## Needs doing

(none)
