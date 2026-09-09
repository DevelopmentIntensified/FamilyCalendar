# 043 — Calendar even faster, round 2

Status: in-progress

## Done

- Parallel wave 1: personal/family/ads/verse guards → one `Promise.all`
  (deps already in hand via layout parent). Shell TTFB ~0.8s → ~0.64s
  (−20%), full body ~1.1s → ~0.87s. Bench data renders, warnings clean.
- Instant feel: views STAY static (async chunks would blank-flash on
  switch — tried, reverted). 1420-line EventFormModal splits to a
  108KB/31KB-gzip lazy chunk (dynamic `import()`, cached promise),
  prefetched on FAB hover/focus + browser-idle. Modal open latency
  100ms, zero page errors (Playwright).

## Needs doing

- Index `events.calendar_id` (only `mirrorOf` is indexed; every load
  filters per calendar) — `sql/` migration + user SQL.
- Dynamic-import non-default views + EventFormModal (smaller route chunk).

## Done

- `sql/014-events-calendar-index.sql` (+ schema parity):
  `events_calendar_id_idx`, `events_calendar_id_start_idx`.
  **NEON PENDING — run manually.** Local A/B (42-row table, ANALYZE'd):
  no measurable delta either way (Neon ±300ms variance dominates) —
  kept for production-scale tables where unindexed per-calendar filters
  seq-scan everything.
