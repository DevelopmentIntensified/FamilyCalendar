# 235 — /calendar/tasks reads My Tasks before the recurring cursor sync runs

Status: done

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/routes/(calendar)/calendar/tasks/+page.server.ts:62` `getMyTasks` runs in parallel with `getTasksForUser` (which syncs); `getMyTasks` never syncs.

## Repro

Daily task left unchecked yesterday shows red with yesterday's date on first load; fixed after refresh.

## Done

- `src/routes/(calendar)/calendar/tasks/+page.server.ts`: the `tasks+cursor` leg (`getTasksForUser`, which owns the pin) is awaited first; My Tasks / To accept / Requested then load in parallel. A failing sync leg still degrades to its fallback and the sections still load.
- New `src/routes/(calendar)/calendar/tasks/page.server.test.ts` (ordered spies): `starts every non-syncing section read only after getTasksForUser resolved` — red (getMyTasks started at index 1, sync ended at 7) -> green; plus zone pass-through and leg-fallback cases.
- Trade-off: one extra round-trip of latency on this page (sync-bearing read, then the three section reads).

## Needs doing

(none)
