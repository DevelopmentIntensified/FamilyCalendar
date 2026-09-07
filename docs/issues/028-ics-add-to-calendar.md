# 028 — Add-to-calendar (.ics export)

Status: open

## Needs doing

- "Add to calendar" affordance so users can push an event into their
  phone's native calendar (Google Calendar etc.) — the no-native-app
  path alongside #027.
- Implement: `GET /api/events/[id]/ics` returning `text/calendar`
  (attachment) — builds VEVENT from the event row: title, start/end
  (UTC instants, `Z` form), location, description, recurrence (RRULE
  incl. BYDAY/COUNT/UNTIL as stored — check recurrenceService
  normalization; floating/UTC time limitations noted), master vs single
  instance (scope-'this' exceptions: export the instance fields; series:
  RRULE).
- RESEARCH (2026-09-06): Google `render` URL supports recurrence —
  `calendar.google.com/calendar/render?action=TEMPLATE&text&dates&recur=<URL-encoded RRULE>&details&location&ctz`.
  On Android `render` correctly reaches the Google Calendar event
  editor. So add an "Add to Google" link alongside the .ics download;
  no library needed (add-to-calendar-button supports RRULE since v2.12
  but hides Yahoo/Outlook options for recurring events and adds two
  dependencies — rejected). Hand-rolled covers Google (recur link) +
  Apple/Outlook/etc (.ics).
- Buttons: event detail page (event/[id]) + EventModal footer
  (after #026 lands — it owns that file now). Family events: any
  viewer can export (their own calendar, read-only semantics).
- Dispatch after #026 lane lands.
