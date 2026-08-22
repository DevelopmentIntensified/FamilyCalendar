# Family Planz Roadmap

Decisions locked in planning sessions (latest 2026-08-21). Domain language lives in [CONTEXT.md](../CONTEXT.md).
Superseded planning docs live in [docs/archive/](./archive/).

## Shipped — full log

**Foundations & fixes**
- Session persistence bug (no cookie `maxAge` → constant mobile logouts); manual Set-Cookie headers fixed; 90d/30d session config
- PWA manifest + icons; Android homescreen installs standalone
- Month header reactivity fix (`get(store)` in `$:` isn't reactive)
- Week view: events span their true time range; correct grid-height math; horizontal scroll on phones
- Day drill-down: tap a day → agenda-style Day View, back returns
- Settings gear + print icon on calendar toolbar
- Calendar settings consolidated into `/account`; ad preferences restored there too

**Recurring events & smart schedules**
- `frequency`+`interval` columns; virtual occurrence expansion with anchor-correct month/year math; Exception Overrides (edit/cancel single occurrences vs series)
- Runtime Date-object normalization fix (postgres.js hands back Dates despite mode:'string')
- 34-template Smart Schedules catalog (car/home/cleaning) in create form

**Accounts**
- Anonymous Accounts: silent server account on first protected visit, no signup wall; guest entry CTAs on login/signup pages
- Claiming via magic link (hashed tokens) → sync across devices; Claim Conflict escape hatch
- Inactivity Window: weekly Vercel cron deletes idle-90d unclaimed accounts; warning banner with days remaining
- Guest email-change guard + claim success toast

**Tasks**
- Tasks entity + `/calendar/tasks` page (quick-add with due-date keywords: "clean gutters saturday") + full API
- Event checklists in create form, edit form and detail modal; cascade-safe delete warnings
- Weekly completion counter (baseline framing)

**Calendar power features**
- ICS import from Google/Apple/Outlook exports: file upload, ownership-checked target calendar, duplicate skip, RRULE FREQ/INTERVAL mapping, 500-event cap
- Print for fridge: landscape one-pager per month, colored dots, today ring, auto-print option
- Duplicate event action
- Events show their calendar: tooltips on chips, inline labels in day/list views
- Instant UI after event creation (optimistic merge)
- NLP parser v2: recurrence phrases, relative offsets ("in 2 weeks"), weekend, month abbreviations incl. "Sept", explicit years, day-first dates, ISO dates, colloquial times ("half past seven pm"), military time, colon-less ranges — 94 parser tests

## Tiers (original plan, all shipped)

| Tier | Items |
|------|-------|
| ~~1~~ ✓ | Marketing/calendar mobile, session fix, PWA |
| ~~2~~ ✓ | Recurring events → smart templates |
| ~~3~~ ✓ | Anonymous accounts/claiming/retention, tasks |

## Future ideas (from research, not committed)

- **Event chat**: comment thread per event so family members coordinate in-context ("who's bringing snacks?"). Needs a `event_messages` table, realtime or poll-based thread UI inside EventModal, and permission rules tied to family membership. Natural extension of the existing checklist pattern.
- Hour-grid Day View upgrade (free/busy at a glance)
- Full iCalendar RRULE upgrade (BYDAY/BYMONTHDAY/UNTIL) — current schema migrates cleanly
- Family availability traffic lights; shareable URL views; weekly digest email; smart nudges (only non-actors, before+after deadline); forgiving schedule-aware streaks with freeze + tiered credit; cooperative family weekly meter; cursor-materialized recurring tasks; single-field quick-add markup; service worker offline capture
