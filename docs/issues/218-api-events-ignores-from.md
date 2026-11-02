# 218 — GET /api/events?from=&to= serves only the month of `to`

Status: done

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`src/routes/api/events/+server.ts:47` `monthGridWindow(range.to)` though `resolveEventRange` allows 62 days.

## Repro

`?from=2026-11-01&to=2026-12-31` returns Dec grid only; most of Nov missing, no error.

## Done

- New pure `eventRangeWindow(range)` in `src/lib/server/services/eventRange.ts`: `from` 00:00Z - 7d .. `to` 23:59:59.999Z + 7d (grid padding, same as `monthGridWindow`). Lives in `$lib` because `+server.ts` may only export handlers.
- `GET /api/events` builds its query + expansion window from it instead of `monthGridWindow(range.to)`.
- Tests: `eventRange.test.ts` > `eventRangeWindow (#218)` (two months, one month, single day, across year end; exact padding); `api/events/server.test.ts` > `expands the WHOLE from..to range, not just the month of \`to\` (#218)` (expansion mock now records the window it is given).
- Red: 5 + 1 failed. Green: 24/24 under TZ=UTC and TZ=America/Chicago.

## Needs doing

(none)
