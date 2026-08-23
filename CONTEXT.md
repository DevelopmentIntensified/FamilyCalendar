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
A completable item, optionally due on a date, belonging to a person or family. Carries completion history and stats (future).
_Avoid_: todo, chore, checklist item

**Recurring Task**:
A Task with a schedule (frequency + interval). Exactly one live occurrence exists at a time — the cursor. An overdue occurrence sticks to today until done; completing snaps the next one onto the schedule anchored at `max(due, today) + interval` (early checks keep the slot, late ones slide). One row per task — no occurrence expansion.
_Avoid_: repeating task, series, materialized backlog

## Relationships

- An **Anonymous Account** becomes a permanent account through **Claiming**
- An unclaimed **Anonymous Account** is deleted after one **Inactivity Window**
- A **Claim Conflict** routes the user through login before any data merge
- Anonymous users are warned their data cannot sync without **Claiming**
- An **Event** can have **Tasks** attached to it
- A **Task** carries its own completion history and stats (future)

## Example dialogue

> **Dev:** "User claims their guest account but the email belongs to their old password account."
> **Domain expert:** "That's a **Claim Conflict** — show the escape hatch: log in first, then merge. Never auto-merge."

> **Dev:** "Does an **Anonymous Account** expire?"
> **Domain expert:** "After one **Inactivity Window** — 90 days of no action — it's deleted."

## Flagged ambiguities

- "session save longer" was ambiguous between auth-session length and draft autosave — resolved: auth session cookie lifetime (mobile logout bug).
- "onboarding" originally meant signup guidance — resolved: removing signup from the critical path via **Anonymous Accounts**.
