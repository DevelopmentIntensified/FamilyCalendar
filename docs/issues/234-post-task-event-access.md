# 234 — POST /api/tasks attaches to any eventId without access check; bad input 500s

Status: open

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/routes/api/tasks/+server.ts:122` `eventId: body.eventId || null` unchecked; list joins event title/start. Unknown eventId -> FK 500; invalid dueDate -> 500.

## Repro

User with another family's event id reads its title/start; garbage dueDate returns 500.

## Done

(none yet)

## Needs doing

- Check event access (403/400); validate dueDate (400).
- Red test first where a seam exists (`tdd`).
