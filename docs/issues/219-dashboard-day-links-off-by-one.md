# 219 — Day Dashboard prev/next/day-view links are one day early when server zone is east of user

Status: open

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`src/routes/(calendar)/calendar/dashboard/+page.svelte:20` `DateTime.fromISO(data.dayISO).setZone(data.zone)` parses in process zone first. Failing tests: `dashboard/page.svelte.test.ts` 'names the three days', 'two ways out'.

## Repro

Vercel SSR (UTC), US user on 2026-09-29: Prev -> 09-27, Day view -> 09-28.

## Done

(none yet)

## Needs doing

- `DateTime.fromISO(data.dayISO, { zone: data.zone })`.
- Red test first where a seam exists (`tdd`).
