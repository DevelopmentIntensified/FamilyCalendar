# 228 — Dragging a non-recurring event wipes its reminder

Status: open

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/utils/eventMove.ts:92-101` always sends `scope:'this'` w/o reminderMinutes; `api/events/[id]/+server.ts` non-recurring path does full update with `reminderMinutes: body.reminderMinutes ?? null`.

## Repro

Event with 30-min reminder, drag in Day/Week view -> reminder gone.

## Done

(none yet)

## Needs doing

- In PUT, keep `existing.reminderMinutes` (and other fields) when omitted from body.
- Red test first where a seam exists (`tdd`).
