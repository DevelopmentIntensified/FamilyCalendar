# 224 — Overnight / multi-day events missing from their last day

Status: done

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/utils/eventDisplay.ts:61` `Math.round(Math.abs(end.diff(start, 'days').days))`.

## Repro

Mon 22:00-Tue 02:00 shows only Monday; Fri 20:00-Sun 02:00 misses Sunday.

## Done

- `parseEvents` (`src/lib/utils/eventDisplay.ts`) now counts calendar days via `end.startOf('day').diff(start.startOf('day'))` (viewer zone) instead of rounding a 24h-block diff.
- Test: `eventDisplay.test.ts` table `multi-day %s appears on every calendar day it touches (#224)` (overnight Mon 22:00→Tue 02:00, Fri 20:00→Sun 02:00, Mon 23:30→Wed 00:30). Red: 3 failed (only first day / missing last). Green: all pass; existing DST + viewer-zone cases unchanged.

## Needs doing

(none)
