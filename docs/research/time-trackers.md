# Research: Time trackers (Toggl, Clockify, RescueTime, Harvest, Timely, TimeCamp, Rize)

## Raw notes

**Toggl Track** — one-click timer as core interaction ("capture first, categorize later"); idle detection with forgiving correction; calendar integration converting events to time entries; Pomodoro + break reminders; offline tracking; shared entries; favorites/recents; scheduled report emails.

**Clockify** — multiple capture modes side by side (timer, manual, weekly timesheet, calendar blocks, auto-tracker, kiosk); timesheet templates + "copy week"; smart reminders only when untracked; drag/resize calendar blocks; auto-tracker gap detection; kiosk PIN/QR clock-in on shared devices; approvals locking entries.

**RescueTime** — fully passive tracking; daily productivity score/pulse; weekly summary email vs own baseline; goals with deviation alerts; Assistant hub; history depth as free-tier lever.

**Harvest** — deadline-based reminders sent before AND after, **only to people who haven't submitted** (removes the nagging conversation); quick time entry; track from calendar; color-coded team dashboard; budget alerts.

**Timely** — Memory Tracker drafts timesheets via AI, human reviews/confirms ("review instead of remember"); privacy-first positioning.

**TimeCamp** — keyword-based auto-assignment rules; copy previous day; attendance doubling as presence data.

**Rize** — passive capture, no approval step; focus quality score + AI coach nudges; smart breaks; planned-vs-actual day comparison.

## Tagged backlog

- `[calendar-view]` Convert calendar events into logged/completed items one-tap
- `[calendar-view]` Drag-to-create and resize event blocks on week grid
- `[recurring-events]` "Copy last week" instantiating a week of recurring events/tasks
- `[recurring-events]` Reusable activity templates pre-filling a week or routine
- `[retention]` Deadline nudges before AND after due moment, only to non-actors
- `[retention]` Weekly digest: upcoming week + last week's completions
- `[stats]` Single daily/weekly score per person/family to gamify follow-through
- `[stats]` Planned-vs-actual view
- `[stats]` Trend lines against own baseline, not leaderboards
- `[tasks]` Quick-complete affordances: favorites/recents row for high-frequency tasks
- `[tasks]` Completion history locked after approval window for trustworthy stats
- `[mobile]` Home-screen widget / quick actions for one-tap completion
- `[mobile]` Offline-first capture with background sync
- `[onboarding]` Zero-setup start: useful value before any configuration
- `[reporting]` Saved filters + scheduled email delivery to chosen family members
- `[reporting]` Per-person color coding across shared views
- `[retention]` Shared-item invitations: creator makes, others accept into their view
- `[stats]` Gap detection: highlight days where nothing was completed

## Mini-PRDs

### A — Smart nudges (effort M)
Nudge engine attached to Events (RSVPs) and Tasks (completions): optional deadline; nudge before and once after — only to members who haven't acted, capped per person per day. Parent gets a targeted "nudge again" button replacing verbal nagging. Needs a scheduled job (shared infra with Inactivity Window cleanup) + a `reminders` table.

### B — Weekly family digest (effort S–M)
Auto-generated weekly email per family: next week at a glance, who hasn't RSVP'd, completions vs recent average (baseline framing), unassigned/upcoming recurring events needing attention. Configurable day/time; deep links per actionable item. Pure read-side aggregation + templated email + cron trigger. Highest insight-per-effort found.
