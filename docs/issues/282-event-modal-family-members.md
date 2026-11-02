# 282 — Event edit from calendar views can't add uninvited family members; task tab lacks category

Status: open

Source: 2026-11-02 leftovers pass.

## Evidence

#274 follow-up: `EventModal` callers (MonthDays, WeekView, DayView, ListView, Day Dashboard) pass no `familyMembers`, so the edit form's AttendantPicker can only show already-invited members. Also the event modal's task tab creates tasks without `category` (#280).

## Done

(none yet)

## Needs doing

- Thread the family member list to EventModal from every caller (one shared source, e.g. the calendar page/layout data — no per-view refetch); edit form can add any family member; event task tab gets the shared CategoryField. Tests per caller wiring + picker shows uninvited members.
