# 285 — Day Dashboard shows multi-day events only on their start day

Status: open

Source: 2026-11-02 leftovers pass.

## Evidence

#217 follow-up: `src/routes/(calendar)/calendar/dashboard/+page.server.ts` filters day events by start date only, so a trip Oct 15-Nov 10 doesn't appear on Nov 3's dashboard.

## Done

(none yet)

## Needs doing

- Include events overlapping the viewed day in the user's zone (start < dayEnd && (end ?? start) >= dayStart); all-day multi-day too. Tests incl. zone edges.
