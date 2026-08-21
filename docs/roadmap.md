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

## Tier 2 — shipped

| Item | Locked design |
|------|---------------|
| Recurring Events | `frequency` (day/week/month/year) + `interval` (every N) as structured columns (`recurrence_frequency`, `recurrence_interval`). Occurrences expanded virtually at read time (±2y window, 500 cap) with composite ids `{masterId}~{occISO}`; anchor-based generation so "monthly on the 31st" re-anchors after short months and Feb 29 yearly rolls to Mar 1. **Exception Overrides** in `event_exceptions`: edit/delete of a single occurrence ("This event only" vs "All events in series" choice); cancelled occurrences skipped during expansion. Full iCalendar RRULE is a later upgrade — schema migrates cleanly |
| Smart Event templates | Static catalog `src/lib/data/smartEventTemplates.ts` (car / home / cleaning, 34 templates from standard maintenance schedules). "Smart schedules" panel in the create form prefills title/description/frequency/interval |

## Tier 3 — shipped

| Item | Locked design |
|------|---------------|
| Onboarding redesign | **Anonymous Accounts**: server account created silently on first visit to a protected route, no email. **Claiming** attaches a verified email via magic link (`/claim`, sha256-hashed tokens, 15-min TTL) → sync across devices. **Claim Conflict** (email already registered): block + escape hatch ("log in first"), re-checked at click time — never silent merge. Guest banner shows sync warning + days remaining; red under 14 days |
| Retention | `/api/cron/cleanup` (protected by `x-cron-secret`) deletes unclaimed Anonymous Accounts idle > 90 days (**Inactivity Window**); "no action" = any authenticated request refreshes `lastActiveAt` in hooks (1h throttle). Expired claim tokens cleaned in same job. Wire to a weekly external scheduler with `CRON_SECRET` set |
| Tasks | `tasks` table: title/notes/optional due date/completedAt, owner, optional family scope, optional event attachment. `/calendar/tasks` page (quick-add, overdue highlighting, completed section) + full API. Events-attached task UI and completion stats are future |

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
