# 226 — Bulk bar: Enter in "+ Attendant" adds one guest named "Ann, Bob"

Status: done

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`BulkEditBar.svelte` Enter handler sends `add: [bulkAttendants]`; the button splits on `,` and trims.

## Repro

Type `Ann, Bob`, Enter -> one guest 'Ann, Bob' on every selected event.

## Done

- `BulkEditBar.svelte`: Enter and the Add button both call `runAttendants()` (split on `,`, trim, drop empties; no-op when nothing left / busy / no selection).
- Tests (`BulkEditBar.svelte.test.ts`): `Enter in + Attendant splits %j like the button (#226)` ("Ann, Bob", "  Ann ,,Bob , ", "Ann") + `Enter in an empty + Attendant does nothing (#226)`. Red: 3 failed (add ['Ann, Bob'] / [' , ']) -> green.

## Needs doing

(none)
