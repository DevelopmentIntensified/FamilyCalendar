# 231 — PUT /api/tasks/[id] with only recurrenceInterval silently ignored (200)

Status: open

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`[id]/+server.ts:91-94` interval patched only when frequency present; unknown frequency strings ignored instead of 400.

## Repro

`PUT {recurrenceInterval:2}` on a weekly task -> 200, interval still 1.

## Done

(none yet)

## Needs doing

- Patch interval alone when stored task is recurring; 400 on unknown frequency.
- Red test first where a seam exists (`tdd`).
