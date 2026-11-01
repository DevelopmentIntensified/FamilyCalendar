# 226 — Bulk bar: Enter in "+ Attendant" adds one guest named "Ann, Bob"

Status: open

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`BulkEditBar.svelte` Enter handler sends `add: [bulkAttendants]`; the button splits on `,` and trims.

## Repro

Type `Ann, Bob`, Enter -> one guest 'Ann, Bob' on every selected event.

## Done

(none yet)

## Needs doing

- Share the button's split/trim/filter logic.
- Red test first where a seam exists (`tdd`).
