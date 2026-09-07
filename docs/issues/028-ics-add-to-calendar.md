# 028 — Add-to-calendar (.ics export)

Status: done

## Done

- `GET /api/events/[id]/ics` (`src/routes/api/events/[id]/ics/+server.ts`):
  auth-gated; access via the existing `canTouchEvent` pattern (owner or
  accessible calendar ⇒ allowed; 404 not-found, 403 forbidden, 400 bad id).
  Accepts the composite display id (`master~occurrenceISO`): a scope-'this'
  exception exports the exception instance's fields as a single VEVENT (no
  RRULE); a cancelled occurrence 404s; occurrence without exception falls
  back to the series. Returns `text/calendar; charset=utf-8` with
  `Content-Disposition: attachment; filename="<title-slug>.ics"`.
- New util `src/lib/utils/ics.ts` (+ `ics.test.ts`, 29 tests, red→green):
  RFC 5545 escaping (comma/semicolon/backslash/newlines), UTC `Z`-form
  DTSTART/DTEND, all-day `DTSTART;VALUE=DATE` with exclusive DTEND (DB
  stores all-day ends inclusive end-of-day → rolled one day forward),
  `UID:<eventId>@familyplanz.com`, DTSTAMP, RRULE passthrough built from
  the normalized recurrence write shape (FREQ/INTERVAL/BYDAY, UNTIL xor
  COUNT per RFC — UNTIL wins). CRLF-delimited VCALENDAR wrapper.
  `buildGoogleCalendarUrl` builds the client-side Google render URL
  (`action=TEMPLATE&text&dates&recur=<RRULE>&details&location&ctz`) —
  research 2026-09-06 confirmed `recur` support.
- Buttons ("Add to Google" link + "Add to .ics" download anchor, min-h-11,
  320px-safe): EventModal details section (hidden for ad events; #026's
  creator row untouched) and event detail page (`event/[id]`) action row.
  Any viewer who can see the event can export — family events included.
- Gates: vitest ics.test.ts 29/29 red→green; full suite 1268 passed / 87
  files; playwright e2e/events + e2e/mobile 13 passed 1 skipped (Docker DB
  up); oxlint 0 warnings/errors on touched files; prettier run on touched
  files; `npm run check` 0 errors; `npm run build` green.

## Limitations

- Times export as UTC instants (`Z` form), consistent with the app's
  UTC-expansion model and the deferred DST ADR: recurring events keep
  UTC wall-time, so for non-UTC users the local start time can drift an
  hour across DST boundaries. All-day events export as calendar dates
  (no drift). No fix planned here — revisit when the DST ADR lands.
