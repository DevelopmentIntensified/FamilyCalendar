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
A completable item, optionally due on a date, with a **Task Visibility** — private, public, or family. Belongs to a person; assigning starts a pending handoff (Requested / To Accept queues); decline returns it to the assigner. Carries completion history.
_Avoid_: todo, chore, checklist item

**Task Visibility**:
The three-level scope of a Task — `'private' | 'public' | 'family'`. New tasks default public; changing visibility is owner-only. Public tasks are read-only for other family members.
_Avoid_: sharing level, scope flag

**Private Task**: A Task visible only to its owner, plus assignee and assigner while assigned.
_Avoid_: hidden task

**Public Task**: A personal Task shared with the family: owner's list plus the family page's Public tab; other members read-only.
_Avoid_: shared task

**Family Task**: A family-scoped Task; appears on an individual's list only when assigned to them, keeping its Family label/filter.
_Avoid_: household task

**Requested / To Accept**: The two assignment queues: Requested = tasks the viewer assigned out (Pending/Accepted/Declined); To Accept = tasks assigned to the viewer awaiting response. Accept moves it into the assignee's list; decline returns it to the assigner.
_Avoid_: outgoing/incoming assignments

**Recurring Task**:
A Task with a schedule (frequency + interval). Exactly one live occurrence exists at a time — the cursor. Completing snaps the next one to today + n×interval, where n is the smallest multiple landing strictly past the current due date (early checks advance from today; a due date already one interval out pushes the next check two intervals out). Each completion increments the task's completion count. One row per task — no occurrence expansion.
_Avoid_: repeating task, series, materialized backlog

**Recurring Bill**:
A Bill with a schedule (frequency + interval); its dueDate doubles as the cursor. Marking paid advances the cursor: next due = old due + n×interval, where n is the smallest multiple landing strictly after today — anchored on the stored due date, not on today (the difference from the Task cursor: an early pay keeps the anchored cadence instead of re-anchoring to today). Paying late skips missed periods. Unmark-paid never rewinds the cursor. Both fields null = one-off. One row per bill — spend reports and lists read the cursor due, so a recurring bill appears once per period, never as materialized occurrences.
_Avoid_: repeating bill, materialized bill backlog

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

### Bills & Receipts

**Bill**:
A tracked expense with title, amount as integer cents, optional due date, and a category derived from **where it was from** (the merchant, via the Tag Table) — user-editable. Quick-add phrases parse into a prefilled form the user confirms — a parse is a hint, never a commit. Bills created manually (not from a receipt) carry editable Line Items too.
_Avoid_: invoice

**Category**:
The closed expense vocabulary: housing, utilities, subscriptions, insurance, **tax**, **fees**, other. Tax and fees are their own categories — a receipt's tax/fee lines are labeled as such, never absorbed into the merchant's category.
_Avoid_: bucket, group

**Line Item**:
One parsed (or manually entered) receipt row on a Bill — label, price cents, and its own category **Label**. Line-item Labels are the ground truth for category-level spend detail; items without an explicit Label count under the Bill's category.
_Avoid_: item photo

**Spend Detail**:
Category-level view of where money goes, computed from Line Item Labels when a Bill has them, and from the Bill's category when it doesn't.
_Avoid_: breakdown, analytics

**Tag Table**:
The learning store with three mappings: merchant → category (sets Bill categories), item → category (suggests Line Item Labels), and (merchant, store-SKU) → item name + category for code-only receipts — store SKUs are merchant-internal and stable, so users label them once and everyone benefits. Per-user rows take precedence over global rows; confirmed labels train both. Codes that pass GTIN validation go to public lookup APIs instead.
_Avoid_: learning model

**Receipt**:
A photo of a bill, PROCESSED AND DELETED: parsed on-device into text and numbers, never uploaded or stored. Only the parsed fields and Line Items persist.
_Avoid_: receipt image upload

**OCR Chain**:
The ordered scan-engine fallback: Chrome Prompt API (on-device) → native bridge (ML Kit/iOS Vision, future app) → tesseract.js → opt-in Azure Document Intelligence (cloud, per-scan consent, only when server-configured).
_Avoid_: OCR ladder

## Relationships

- An **Anonymous Account** becomes a permanent account through **Claiming**
- An unclaimed **Anonymous Account** is deleted after one **Inactivity Window**
- A **Claim Conflict** routes the user through login before any data merge
- Anonymous users are warned their data cannot sync without **Claiming**
- An **Event** can have **Tasks** attached to it
- A **Task** carries its own completion history and stats (future)
- A **Task** has exactly one **Task Visibility**; **Family Tasks** surface on an individual's list only when assigned to them
- A **Bill** optionally carries **Line Items**, each with its own category **Label**; confirmed labels train the **Tag Table** (user rows override global rows)
- A **Receipt** produces **Line Items** and is then discarded — no image bytes persist anywhere
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
