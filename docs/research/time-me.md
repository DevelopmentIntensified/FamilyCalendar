# Research: time.me / timeme.com / timeanddate.com

Note: the literal domain `time.me` is a domain-registrar promo page, not a product. Three adjacent products were analyzed instead.

## Raw notes

**TimeMe (timeme.com)** — online timers since 2005: countdown, stopwatch, split-lap, alarm, chess clock. Notable: every timer configuration serializes into a shareable/bookmarkable **URL** — persistence is the link itself, zero accounts. Large-digit displays designed for projection.

**TimeMe (timeme.io)** — B2B workforce management ($5–15/user/mo): automated tracking; structured approve/reject workflows; leave management where approval auto-adjusts capacity ("instantly see who is unavailable today"); capacity heat map showing who has white space vs burnout risk; budget burn-rate alerts; one-tap mobile actions.

**timeanddate.com** — meeting planner with **traffic-light method**: green = working hours, yellow = non-working daytime, red = sleeping/holidays/weekends. Public holidays rendered in-planner; DST invisible; persistent default locations; duplicate-meeting action; ICS export; printable PDF calendars.

## Tagged backlog

- `[calendar-view][mobile]` Per-person colored availability strip answering "who can actually attend?"
- `[calendar-view][retention]` Today-strip banner: who's unavailable/out today
- `[recurring-events]` Approved absence auto-pauses or flags affected Recurring Events
- `[onboarding][retention]` Serialize calendar filter/view into shareable URL (works pre-Claiming)
- `[tasks][mobile]` Parent-approval workflow: kid proposes, parent taps approve/reject
- `[mobile]` One-tap RSVP + quick-request actions as primary mobile interactions
- `[stats]` Workload/overbooked heat map per family member across the week
- `[calendar-view][recurring-events]` National/local holiday layer in month/week views
- `[calendar-view]` "Duplicate event" quick-action for rescheduling
- `[retention][calendar-view]` Fridge-printable one-page week PDF
- `[onboarding]` Guided "<10 minutes to first value" flow post-anonymous-signup
- `[stats]` Threshold alerts on family load (e.g., >3 evening events/day)

## Mini-PRDs

### A — Family availability traffic lights (effort M)
Each member gets a simple rhythm profile (asleep ~22:00–07:00, school/work, free). Week view renders optional per-day/per-hour colored bands per person; event composer shows live traffic-light row for invitees so conflicts surface before RSVP chaos. Holidays render whole days red.

### B — Shareable URL views (effort S)
Serialize UI state (`?view=week&who=emma&from=2026-08-24`) into the URL; "Copy link to this view" gives stateless persistence — bookmark it, text it to your partner, pin it. Zero server storage, works pre/post Claiming, doubles as organic sharing and a natural Claiming moment.
