# 224 — Overnight / multi-day events missing from their last day

Status: open

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/utils/eventDisplay.ts:61` `Math.round(Math.abs(end.diff(start, 'days').days))`.

## Repro

Mon 22:00-Tue 02:00 shows only Monday; Fri 20:00-Sun 02:00 misses Sunday.

## Done

(none yet)

## Needs doing

- Diff calendar days: `end.startOf('day').diff(start.startOf('day'), 'days').days`.
- Red test first where a seam exists (`tdd`).
