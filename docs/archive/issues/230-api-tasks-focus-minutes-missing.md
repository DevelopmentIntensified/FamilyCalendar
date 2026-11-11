# 230 — GET /api/tasks never returns focusMinutes

Status: done

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/lib/server/db/actions/tasks/queries.ts:31-56` explicit select lacks `focusMinutes`; #211 contract says it is returned; Android shows 'Xm focus' from it.

## Repro

Android task rows never show focus minutes.

## Done

- Fixed by #265 (2026-11-01): `getTasksForUser`, `getTasksForFamily` and `sectionSelect` now select
  `focusMinutes` (+ new `focusStartedAt`); red-first select-shape test in `tasks.test.ts`.
