# Family Planz

A family calendar application. This document defines the canonical domain language.

## Language

### Accounts & Identity

**Anonymous Account**:
A server-side account created silently on first visit, with no email attached. Full app access, no sync.
_Avoid_: guest account, device account, temp user

**Claiming**:
Attaching a verified email to an Anonymous Account, making its data syncable across devices.
_Avoid_: upgrade, convert, register

**Magic Link**:
A one-time emailed link that proves email ownership, used for Claiming and passwordless login.
_Avoid_: login link, email verification link

**Claim Conflict**:
The situation where Claiming targets an email that already belongs to a registered account. Resolution: offer login-then-merge (escape hatch), never silent merge.

### Retention

**Inactivity Window**:
90 days without account action, after which an unclaimed Anonymous Account is deleted with prior warning shown in-app. Enforced by a weekly cleanup job.
_Avoid_: expiry, timeout

### Recurrence

**Recurring Event**:
An Event that regenerates occurrences on a fixed schedule (frequency + interval), expanded virtually at read time.
_Avoid_: repeating event, series

**Exception Override**:
A user edit to a single occurrence of a Recurring Event, stored separately without altering the schedule.
_Avoid_: edit exception, split

### Work Items

**Task**:
A completable item, optionally due on a date, belonging to a person or family. Defaults to its creator unless explicitly assigned to a person; assigning someone else starts pending until they accept. Carries completion history and stats (future).
_Avoid_: todo, chore, checklist item

**Recurring Task**:
A Task with a schedule (frequency + interval). Exactly one live occurrence exists at a time — the cursor. Completing snaps the next one to today + n×interval, where n is the smallest multiple landing strictly past the current due date (early checks advance from today; a due date already one interval out pushes the next check two intervals out). Each completion increments the task's completion count. One row per task — no occurrence expansion.
_Avoid_: repeating task, series, materialized backlog

**Task Priority**:
A user-set importance label on a Task — `'low' | 'normal' | 'high'`, default `'normal'`. The viewer's own tasks lead any ranking reading it (mine-first), then priority, then overdue, then due.
_Avoid_: urgent flag, importance star

**Top-3 Priorities**:
The three Tasks the Day Dashboard surfaces as the family's most urgent for today: family-wide scope (not just the viewer's), ranked Task Priority → overdue → due-today → next-due, with the viewer's own tasks leading.
_Avoid_: my three tasks, priority list, must-do trio

**Family Task Board**:
The Day Dashboard card listing every open Task in the family, grouped by assignee (falling back to the creator when a Task is unassigned). Complements the today-focused Top-3 Priorities.
_Avoid_: chore board, chores card, task board for today

### Day Dashboard

**Day Dashboard**:
A per-day, at-a-glance page answering "what do I need to know — and do — about today": today's events, the Top-3 Priorities, the Family Task Board, Kids' Schedule, Member Strip, Meals, and the Daily Verse. Phase 1 covers today; a `?date=` parameter extends it to any day. A composition layer over Tasks/events/family — not a new data model.
_Avoid_: home screen, overview, dashboard widget page

**Daily Verse**:
A scripture verse rendered on the calendar (compact strip) and/or the Day Dashboard, one per day, gated by the per-user `showDailyVerse` setting and displayed in the user's `verseTranslation` (ESV by default). A future saved-verses "Verse Vault" is a separate, unbuilt feature.
_Avoid_: vault verse, verse of the day strip

**Dashboard Module**:
One card on the Day Dashboard (Today at a Glance, Top-3 Priorities, Family Task Board, Kids' Schedule, Member Strip, Meals, Daily Verse). Each family-level module has a master enable switch controlled by an admin; each user may hide a module for themselves alone. A family-level switch off hides the module for everyone.
_Avoid_: widget, tile, panel

### Family

**Family Member**:
A user who holds membership in a Family. Permissions ride on the membership **role** (`creator` | `admin` | `member`); personal profile rides on **Member Type**.
_Avoid_: household user

**Member Type**:
The personal-profile label on a Family Member — `'parent' | 'child' | 'member'`, default `'member'`. Not a permission. Powers the Kids' Schedule (today's events with a child attendee) and personalization.
_Avoid_: family role, parent/kid role

## Relationships

- An **Anonymous Account** becomes a permanent account through **Claiming**
- An unclaimed **Anonymous Account** is deleted after one **Inactivity Window**
- A **Claim Conflict** routes the user through login before any data merge
- Anonymous users are warned their data cannot sync without **Claiming**
- An **Event** can have **Tasks** attached to it
- A **Task** carries its own completion history and stats (future)
- A **Family Member** carries a **Member Type** (personal profile) separate from their membership **role** (permission)

## Example dialogue

> **Dev:** "User claims their guest account but the email belongs to their old password account."
> **Domain expert:** "That's a **Claim Conflict** — show the escape hatch: log in first, then merge. Never auto-merge."

> **Dev:** "Does an **Anonymous Account** expire?"
> **Domain expert:** "After one **Inactivity Window** — 90 days of no action — it's deleted."

## Flagged ambiguities

- "session save longer" was ambiguous between auth-session length and draft autosave — resolved: auth session cookie lifetime (mobile logout bug).
- "onboarding" originally meant signup guidance — resolved: removing signup from the critical path via **Anonymous Accounts**.
- "dashboard vault verse" was ambiguous between the existing **Daily Verse** and a saved-verses vault — resolved: the dashboard renders the Daily Verse (existing machinery) in Phase 1; a **Verse Vault** (saved/collected verses) is a later, unbuilt feature if it stays wanted.
