# 228 — Dragging a non-recurring event wipes its reminder

Status: done

Source: repo bug audit 2026-11-01 (lane B).

## Evidence

`src/lib/utils/eventMove.ts:92-101` always sends `scope:'this'` w/o reminderMinutes; `api/events/[id]/+server.ts` non-recurring path does full update with `reminderMinutes: body.reminderMinutes ?? null`.

## Repro

Event with 30-min reminder, drag in Day/Week view -> reminder gone.

## Done

- `PUT /api/events/[id]` non-recurring path: keys omitted from the body (title/start/end/description/location/allDay/reminderMinutes) keep `existing.*`; explicit null/'' still clears (edit form sends every field). Drag-move (`buildMovePayload` sends only start/end) no longer wipes reminder, description or location.
- Recurrence fields untouched here (still `normalizeEventRecurrence(body)`; lane #231 owns that line). Non-recurring drag has null recurrence anyway.
- Tests: `api/events/[id]/server.test.ts` `a start/end-only move keeps reminder, description, location, title, allDay` (red: reminderMinutes null etc. -> green) + `explicit nulls still clear (edit form sends every field)` (guard).

## Needs doing

(none)
