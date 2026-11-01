# 237 — Moving another member's family grocery item to Mine sends it to their list

Status: open

Source: repo bug audit 2026-11-01 (lane D).

## Evidence

`groceries.ts:173` `.set({ familyId: target.familyId })` keeps original `userId`.

## Repro

Mom adds milk (Family); Dad taps To Mine -> toast 'Moved to Mine', item lands in Mom's private list.

## Done

(none yet)

## Needs doing

- When moving to personal, set `userId` to the viewer.
- Red test first where a seam exists (`tdd`).
