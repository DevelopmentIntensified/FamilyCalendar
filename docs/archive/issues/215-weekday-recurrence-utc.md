# 215 — byDay recurring events land on the wrong weekday in US zones

Status: done

Source: repo bug audit 2026-11-01 (lane A).

## Evidence

`src/lib/server/services/recurrenceService.ts:236-243` `expandWeekdaySeries` reads `cur.weekday` from a UTC DateTime; `recurrenceByDay` holds local weekdays.

## Repro

Mon 7pm PST, byDay [MO,WE] -> occurrences on Tue/Sun local; anchor Monday dropped. "every weekday at 7pm" shows Sun-Thu.

## Done

- `expandRecurrence(event, windowStart, windowEnd, zone = 'utc')`: new viewer-zone arg. `expandWeekdaySeries` reads the weekday and the week phase (`startOf('week')` diff, `Math.round` for DST) in `zone`; instants still step in UTC so stored Exception keys keep matching.
- `expandEventsForUser(events, window, zone?)` passes it through; callers pass the viewer zone: `calendar/+page.server.ts` (userZone), `dashboard/+page.server.ts` (zone), `api/events/+server.ts` (zone), `print/+page.server.ts` (`zoneFromSettings`).
- Tests: `recurrenceService.test.ts` > `BYDAY weekdays are read in the viewer zone (#215)`: Mon 7pm PST MO+WE; "every weekday at 7pm" Chicago = Mon-Fri; every-2-weeks phase in local week (PST); east of UTC (Tokyo Mon 8am MO+FR); no-zone default unchanged.
- Red: 4 failed (e.g. PST MO+WE gave 11-03/11-08/... local). Green: 50/50 under TZ=UTC and TZ=America/Chicago; services + api/events + calendar page.server suites 1002/1002.
- Not changed: DST wall-clock drift (series step in UTC, so a 7pm series shows 6pm/8pm across a DST change) — pre-existing, would re-key stored exceptions.

## Needs doing

(none)
