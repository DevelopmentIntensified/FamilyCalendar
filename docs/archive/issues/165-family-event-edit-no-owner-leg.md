# 165 — Any family member can rewrite another member's event on the shared calendar

Status: done

Source: security audit (issue 136), 2026-10-15. Rank 5/16 — every family member on every shared-calendar event; no owner leg (unlike tasks).

## Done

- **Fixed 2026-10-22 (local, uncommitted):** write leg added — `canMutateEventRow` (`src/lib/server/db/actions/calendarScope.ts:49`, deliberately narrower than `eventAccessFilter`: the row's owner, a calendar the user owns, or an owned personal calendar). `updateEvent` / `deleteEvent` return undefined/0 when it fails (`events.ts:303`, `:462`); other family members can no longer rewrite or delete another member's event. Bulk flows record a member-move the actor can't authorise as **not-applied** (`bulkApplyService.ts:79-88` counts only successful applies).
- Gates: **34/34** — `events.test.ts` (19, with `eventAccessFilter`/`canMutateEventRow` kept real per the module-mocking oxlint note at `:142`) + `calendarScope.test.ts` (15, issue-165 describe at `:197`).

- `src/routes/api/events/[id]/+server.ts` PUT/DELETE via `eventAccessFilter` (`calendarScope.ts:27-34`) — whole-series edit/delete/move needs only calendar **visibility**.
- Contrast (narrower): tasks require `canMutateTask` (owner leg) for toggle/delete.

## Needs doing

- None (Option B taken over Option A: shared editing narrowed to the owner/owner-leg instead of recording open-editing as deliberate product).
