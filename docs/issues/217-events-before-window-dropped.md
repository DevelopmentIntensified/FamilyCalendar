# 217 — Non-recurring events that start before the visible window are hidden

Status: open

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`recurrenceService.ts:131-133` non-recurring: `s >= windowStart && s < windowEnd ? [s] : []` — loaders query overlapping events but expansion drops them.

## Repro

Trip Oct 15 - Nov 10; open November -> nothing on Nov 1-10. Same for `/api/events` range.

## Done

(none yet)

## Needs doing

- Include when `start < windowEnd && (end ?? start) >= windowStart`.
- Red test first where a seam exists (`tdd`).
