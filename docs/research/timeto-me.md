# Research: timeto.me (Goals Tracker 24/7)

Source: https://github.com/Medvedev91/timeto.me — Kotlin Multiplatform personal productivity app, offline-first, no accounts.

## Raw notes

- Core concept: tap a goal → countdown timer starts; runs 24/7 including sleep. **No stop button — you stop an activity only by starting the next one.** Every transition writes an `Interval` row; durations are diffs between consecutive intervals.
- Goals with 4 completion types (none / timer / started-N-times / checklist), nested parents, progress bars.
- Checklists with nested items and `reset_day` auto-uncheck at day boundary (morning/evening routines).
- Tasks + folders, repeating tasks, calendar events + event templates, notes, shortcuts, pomodoro, history screen with edit, Summary/Chart stats, Zen Mode.
- Data model: `Repeating` = `type_id` + `value` string + `last_day` cursor. Four period types: EVERY_N_DAYS("n"), DAYS_OF_WEEK("0,3,6"), DAYS_OF_MONTH("1,15", 0=last day), DAYS_OF_YEAR("1.19,4.15"). Nullable daytime, `is_important`, `in_calendar` flags.
- **Materialization over virtual expansion**: on app start a transactional sync inserts *real* Task rows for any due date ≤ today and bumps the cursor. Future occurrences computed on demand for calendar display.
- Occurrence→rule linkage via inline text markers (`#r{ruleId}_{day}_{time}`); single parser handles quick-add + storage + rendering.
- Seeded demo data on first launch (11 days of realistic history).

## Tagged backlog

- `[recurring-events]` Recurrence as type + value-string + last_day cursor — covers family needs without cron complexity
- `[tasks][recurring-events]` Materialize recurring Tasks into real rows on due-day via cursor sync (completions need concrete identity)
- `[calendar-view]` Opt-in flag controlling whether recurring items appear on calendar vs list-only
- `[tasks][mobile]` Quick-add inline markup parsed from one text field (`#important`, `#t90m`, `@person`)
- `[onboarding]` Seed realistic demo family on first visit instead of empty state
- `[retention]` In-app "What's New" changelog screen
- `[stats]` Append-only log table as source of truth for stats
- `[tasks]` Routine checklists with day-boundary auto-reset
- `[calendar-view]` Event templates for one-tap creation of frequent events
- `[mobile]` Ambient visibility of current/next item (PWA badge/notification analog)
- `[onboarding]` Deterministic demo-history generator doubling as test fixture
- `[stats]` Editable history — let users fix past completions
- `[mobile]` Zen Mode: gesture-driven distraction-free current-item view
- `[retention]` One-tap JSON export ("your data is yours") pre-Claiming reassurance

## Mini-PRDs

### A — Cursor-based materialization for recurring Tasks (effort M)
Virtual expansion is fine for display-only Events, but completions need stable occurrence identity. Give each recurring Task a period + `last_materialized_on` cursor; a sync pass on app open (piggybacking the weekly cleanup job) inserts concrete Task rows ≤ today in one transaction. Keep virtual expansion for display-only Events.

### B — Single-field quick-add with inline markup (effort S for 3 tokens)
One text input parsing tokens while typing with live preview chips: `@mom @leo` assignee, `!!` important, `30m` duration. Store raw text plus extracted fields — never re-parse on read. Ship 3–5 tokens max.
