# 231 — PUT /api/tasks/[id] with only recurrenceInterval silently ignored (200)

Status: done

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`[id]/+server.ts:91-94` interval patched only when frequency present; unknown frequency strings ignored instead of 400.

## Repro

`PUT {recurrenceInterval:2}` on a weekly task -> 200, interval still 1.

## Done

- `src/routes/api/tasks/[id]/+server.ts` PUT plain-field path:
  - unknown `recurrenceFrequency` (not enum, not null) -> `400 Invalid recurrenceFrequency`; non-finite / non-number `recurrenceInterval` -> `400 Invalid recurrenceInterval`; both before any mutation.
  - interval alone is patched (floored, min 1) when the stored task is recurring; ignored on non-recurring tasks. frequency+interval and frequency=null behave as before.
  - one cached `loadExisting()` read now serves the visibility, assignee and non-owner checks (fewer duplicate selects).
- `docs/guides/task-api-spec.md`: recurrence semantics + the two new 400s.
- Tests `[id]/server.test.ts` › `recurrence patch (#231)` (14 cases: interval-only, clamp, non-recurring, freq+interval, null clear, 4 bad frequencies, 5 bad intervals) — 11 red -> green.

## Needs doing

(none)
