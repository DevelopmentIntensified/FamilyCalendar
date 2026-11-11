# 219 — Day Dashboard prev/next/day-view links are one day early when server zone is east of user

Status: done

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`src/routes/(calendar)/calendar/dashboard/+page.svelte:20` `DateTime.fromISO(data.dayISO).setZone(data.zone)` parses in process zone first. Failing tests: `dashboard/page.svelte.test.ts` 'names the three days', 'two ways out'.

## Repro

Vercel SSR (UTC), US user on 2026-09-29: Prev -> 09-27, Day view -> 09-28.

## Done

- `dashboard/+page.svelte`: `DateTime.fromISO(data.dayISO, { zone: data.zone })` (was `fromISO(...).setZone(...)`, which parsed as process-local midnight first — the previous day in the user's zone whenever the server is east of the user, e.g. Vercel UTC vs US).
- Tests (existing seam): `dashboard/page.svelte.test.ts` > 'names the three days it can reach, by URL', 'still offers the two ways out of the dashboard' (fixture zone America/New_York, day 2026-09-29).
- Red: both failed under TZ=UTC and TZ=Asia/Tokyo (Prev -> 09-27, Day view -> 09-28). Green: 3/3 under TZ=UTC, America/Chicago, Asia/Tokyo.
- Note: client suite run with an uncommitted local vitest config adding `server.fs.allow` (the worktree's node_modules symlink points outside the vite root).

## Needs doing

(none)
