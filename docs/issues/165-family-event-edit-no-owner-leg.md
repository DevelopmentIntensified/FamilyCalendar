# 165 — Any family member can rewrite another member's event on the shared calendar

Status: open

Source: security audit (issue 136), 2026-10-15. Rank 5/16 — every family member on every shared-calendar event; no owner leg (unlike tasks).

## Done

- `src/routes/api/events/[id]/+server.ts` PUT/DELETE via `eventAccessFilter` (`calendarScope.ts:27-34`) — whole-series edit/delete/move needs only calendar **visibility**.
- Contrast (narrower): tasks require `canMutateTask` (owner leg) for toggle/delete.

## Needs doing

- Option A — confirm shared-calendar intent and record the why-not (open editing is the product). Cost: none; closes the finding as deliberate.
- Option B — narrow to owner + creator/admin. Cost: family members lose the ability to fix each other's events; UX change.
- Not choosing (issue 136).
