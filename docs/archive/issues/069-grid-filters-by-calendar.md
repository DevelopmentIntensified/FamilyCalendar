# 069 — The calendar grid cannot filter by calendar

Status: done

Source: `calendar-ui/d-working-calendar.html` review — the key claims "colour =
calendar · see the rail to filter", and the grid cannot do that.

**Blocked by:** None (can start immediately).

## Needs doing

- [x] Per-calendar visibility toggles in the calendar toolbar, so a colour
      means something you can act on.
- [x] Hiding a calendar hides its events in every view — month, week, day,
      list — and its due tasks with it.
- [x] Toggles survive a reload (per user, per device), and "hide all" /
      "show all" are one tap.
- [x] The toggle state is independent of which calendar new events land in
      (the existing default-calendar setting keeps that job).
- [x] Hiding every calendar leaves a real empty state, not a blank grid.
- [x] Tests: toggling filters the fed events; persistence round-trips; the
      default-calendar setting is untouched.

## Done

**Where the toggles live.** `CalendarToolbar.svelte` — a filter icon leads the
right-hand action strip (`:270`, `data-testid="calendar-filter-trigger"`), with
a count badge when calendars are hidden, because a filter that quietly hides
half the week is otherwise invisible. Its popover (`:347`) is a child of the
toolbar ROOT, not of the strip, so the strip's `overflow-x-auto` can never clip
it; anchored `right-4` and capped at `calc(100vw - 2rem)` so it fits 320px. One
`role="switch"` row per calendar (`:369`), state carried by the switch's fill
and the row's mute/line-through — never by hue. "Hide all"/"Show all" is a
single button whose label flips (`:358`).

**Persistence key.** `familyplanz:hiddenCalendars:<userId>`, a JSON array of
calendar ids in `localStorage` — per user, per device, matching the existing
`familyplanz:tzProbed:<userId>` pattern. No round trip, so the page-load
window is unchanged. A corrupt value parses to "nothing hidden" rather than a
permanently blank grid.

**One filter, four views.** `Calendar.svelte:184-185` applies
`visibleByCalendar` to events and due tasks once, above Month/Week/Day/List, so
the views cannot disagree. Tasks have no calendar column, so
`getTasksForUser` now selects `events.calendarId` off its **existing** LEFT JOIN
(`tasks.ts`, `eventCalendarId`) and the page load maps it to `calendarId`,
falling back to the viewer's own personal calendar for a Task with no parent
event. No new query; #042/#043's window is untouched.

**The empty state** (`Calendar.svelte:278`) reads:

> **Filtered** / *Every calendar is hidden* / "Personal Calendar, Smith Family
> are hidden. Nothing is drawn until you turn one back on — your events and due
> tasks are all still here." / **Show all calendars**

It replaces the grid deliberately: a blank grid reads as "nothing scheduled",
which is a different and wrong thing to tell a family. It is gated on
`allCalendarsHidden && nothingLeftToDraw` — a sponsored event is on no calendar
(`calendarId: ''`), so it survives hide-all, and when one is on screen the grid
is not blank and claiming otherwise would be a lie.

**Acks.** Every toggle is instant (a local `let`, no await) and pushes a toast
naming the calendar and what it hid: "Hidden Smith Family — its events and due
tasks are out of every view." No bare `alert()`.

**Files:**
- `src/lib/utils/calendarVisibility.ts` (new) — key, parse/serialize, toggle,
  hide-all/show-all, `visibleByCalendar`. 27 tests.
- `src/lib/utils/calendarVisibility.test.ts` (new) — 27 tests.
- `src/lib/components/calendar/CalendarToolbar.svelte` — trigger + popover.
  Test file 5 → 12 tests.
- `src/lib/components/calendar/Calendar.svelte` — state, filter, empty state.
- `src/lib/components/calendar/Calendar.svelte.test.ts` (new) — 12 tests.
- `src/lib/server/db/actions/tasks.ts` — `eventCalendarId` off the existing join.
- `src/routes/(calendar)/calendar/+page.server.ts` — task → `calendarId` map.
- `src/routes/(calendar)/calendar/+page.svelte` — passes `filterUserId`.
- `src/lib/components/calendar/TaskDetailModal.svelte` — `CalendarTask.calendarId`.

## Notes

- Today the only calendar-aware control chooses the *default* calendar for new
  events, and the calendar's name appears in the list view only.
- Shares the toolbar row with 071. Land them in sequence, not in parallel.
  **071 owns the search input's position — the filter icon is first in the
  action strip, and that slot is what 071 should be aware of.**
- Blocking 070.
