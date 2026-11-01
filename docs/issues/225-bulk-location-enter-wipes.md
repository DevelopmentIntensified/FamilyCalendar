# 225 — Bulk bar: Enter in empty Location clears location on all selected events

Status: open

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`BulkEditBar.svelte` Location input onkeydown Enter -> `onRunBulk({type:'location', location: bulkLocation})` unguarded (button is disabled when empty); server stores `location || null`.

## Repro

Select 5 events, focus Location, press Enter -> all 5 locations wiped, success toast.

## Done

(none yet)

## Needs doing

- Guard with `bulkLocation.trim()` like the button.
- Red test first where a seam exists (`tdd`).
