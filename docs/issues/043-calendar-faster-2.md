# 043 — Calendar even faster, round 2

Status: in-progress

## Done

- Parallel wave 1: personal/family/ads/verse guards → one `Promise.all`
  (deps already in hand via layout parent). Shell TTFB ~0.8s → ~0.64s
  (−20%), full body ~1.1s → ~0.87s. Bench data renders, warnings clean.

## Needs doing

- Index `events.calendar_id` (only `mirrorOf` is indexed; every load
  filters per calendar) — `sql/` migration + user SQL.
- Dynamic-import non-default views + EventFormModal (smaller route chunk).
