# Family Planz Roadmap

Decisions locked in the planning session of 2026-08-21. Domain language lives in [CONTEXT.md](../CONTEXT.md).

## Tier 1 — shipped this push

| Item | Decisions |
|------|-----------|
| Session persistence (mobile logout bug) | Root cause: Lucia cookie had no `maxAge` → browser-session cookie; two endpoints hand-built `Set-Cookie` without expiry. Fix: 90-day session / 30-day idle window, explicit `maxAge` on cookie, proper `cookies.set()` everywhere |
| PWA manifest | `static/manifest.webmanifest`, 192/512 icons, theme color, `viewport-fit=cover`. Android "Add to Home Screen" now installs standalone with persistent cookies |
| Marketing pages mobile | Audit found pages already responsive (`md:` stacking throughout); fixed trust-strip clipping on landing page |
| Calendar mobile | Week view gets `min-w-[700px]` so phones scroll horizontally instead of crushing 8 columns to ~47px each |
| Day drill-down | Tap a day cell (month) or day header (week) → agenda-style **Day View** for that date; back returns to previous view; prev/next step by day while in day view. Replaces the old "+more" modal |

## Tier 2 — next up

| Item | Locked design |
|------|---------------|
| Recurring Events | `frequency` (day/week/month/year) + `interval` (every N) as structured columns. Occurrences expanded virtually at read time; edits stored as **Exception Overrides**. Full iCalendar RRULE is a later upgrade — schema chosen so it migrates cleanly |
| Smart Event templates | Static TS catalog of maintenance templates (car / home / cleaning), researched from real-world schedules. Picking one prefills the recurring-event form. No completion tracking in v1 |

## Tier 3 — designed, not built

| Item | Locked design |
|------|---------------|
| Onboarding redesign | **Anonymous Accounts**: server account created silently on first visit, no email. **Claiming** attaches a verified email via magic link → sync across devices. **Claim Conflict** (email already registered): block + escape hatch ("log in first, then merge") — never silent merge. Anonymous users warned data won't sync without Claiming |
| Retention | Weekly cron deletes unclaimed Anonymous Accounts idle > 90 days (**Inactivity Window**). "No action" = any authenticated request refreshes `lastActiveAt` in hooks. In-app warning when < 14 days remain. No cron infra exists yet — needs an endpoint + host scheduler or lazy sweep |
| Tasks | Separate `tasks` entity (title, optional due date, assignee, family/person scope). **Events can have Tasks attached**. Completion history + stats are future. When smart-event completion tracking lands, occurrence completions write into this model |

## Future ideas (from research, not committed)

- Hour-grid Day View upgrade (free/busy at a glance) once recurring events exist
- Full RRULE recurrence (BYDAY/BYMONTHDAY/UNTIL)
- Family availability traffic lights (timeanddate pattern)
- Shareable URL views — serialize filter/view state into querystring; works pre-Claiming
- Weekly family digest email (next week + who hasn't RSVP'd + completions vs baseline)
- Smart nudges — remind only members who haven't acted, before AND after deadline
- Schedule-aware forgiving streaks with streak freeze + tiered daily credit (see mindfulness research)
- Cooperative family weekly meter + gentle nudges (no leaderboards)
- Cursor-based materialization for recurring *Tasks* (completions need concrete rows; timeto.me pattern)
- Single-field quick-add with inline markup (`@person`, `!!`, durations)
- Demo-data seeding for first-run empty states
- Service worker for offline capture (beyond manifest-only PWA)

See `docs/research/` for full findings.
