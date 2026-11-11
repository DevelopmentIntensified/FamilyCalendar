# 213 — Recurring Task cursor computes "today" in UTC, not the user zone

Status: done

Source: repo bug audit 2026-11-01 (lane C).

## Evidence

`src/lib/server/db/actions/tasks/cursor.ts:40,57,251` — `DateTime.fromISO(nowIso)` (via `toDateTime`, no `setZone:true`) drops the `zonedNow(zone)` offset; startOf('day')/23:59 pin are UTC.

## Repro

Chicago user completes a daily task 10am Nov 1 -> next due Nov 1 18:00 local (today). After ~6pm local the overdue pin (23:59Z) is already past -> task shows overdue.

## Done

- `cursor.ts`: new `parseNow()` parses the zoned now with `{ setZone: true }` (Date objects still via `fromJSDate`); used by `advanceCursor`, `needsOverduePin`, and the `syncRecurringCursors` 23:59 pin. Day boundaries now follow the user's zone.
- Tests (red under TZ=America/Chicago and TZ=UTC, green after):
  - `tasks.test.ts` › `cursor day boundaries follow the zoned now (#213)` — table of LA / Chicago (repro) / Tokyo / Auckland advance cases + 3 `needsOverduePin` zone cases.
  - `syncRecurringCursors.test.ts` › `pins to 23:59 of the USER's day, not the server's (#213)`.
- Three existing `advanceCursor` tests mixed a UTC `NOW` with system-zone date reads; they now read results back in the now's zone (`setZone: true`). Behaviour on Vercel (system UTC) is unchanged for zone-less callers.
- Undo derivation (`derivePreviousCursor`) anchors on the stored completedAt; left as-is — its match check falls back to the same one-interval rewind, so the zone doesn't change the result in practice.

## Needs doing

(none)
