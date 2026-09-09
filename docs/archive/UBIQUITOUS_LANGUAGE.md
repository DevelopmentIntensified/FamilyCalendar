# Ubiquitous Language

## Accounts & Identity

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Anonymous Account** | A server-side account created silently on first visit, with no email attached; full app access, no sync | guest account, device account, temp user |
| **Claiming** | Attaching a verified email to an Anonymous Account, making its data syncable across devices | upgrade, convert, register |
| **Magic Link** | A one-time emailed link that proves email ownership, used for Claiming and passwordless login | login link, email verification link |
| **Claim Conflict** | Claiming targeting an email that already belongs to a registered account; resolution is login-then-merge, never silent merge | — |
| **Inactivity Window** | 90 days without account action, after which an unclaimed Anonymous Account is deleted (weekly cleanup job) | expiry, timeout |

## Calendar

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Event** | A calendar entry with date/time, optional location, attendees, and recurrence; lives on a personal or family calendar | appointment, entry |
| **Recurring Event** | An Event that regenerates occurrences on a fixed schedule (frequency + interval), expanded virtually at read time | repeating event, series |
| **Exception Override** | A user edit to a single occurrence of a Recurring Event, stored separately without altering the schedule | edit exception, split |
| **Family Calendar** | The calendar a Family shares; every Family Member sees its events | shared calendar |
| **Personal Calendar** | A user's own calendar; events are visible to that user (plus assignee/assigner flows where applicable) | private calendar |
| **Creator** | The person who made an Event; surfaced on family events as "by \<name\>" | owner |

## Tasks

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Task** | A completable item, optionally due, with one of three visibility levels — see **Private**, **Public**, **Family** | todo, chore, checklist item |
| **Recurring Task** | A Task with a schedule; exactly one live occurrence (the cursor) exists at a time, one row per task | repeating task, materialized backlog |
| **Task Priority** | `'low' \| 'normal' \| 'high'` label; ranking is mine-first → priority → overdue → due | urgent flag, importance star |
| **Private Task** | A Task visible only to its owner, plus the assignee and assigner while assigned | hidden task |
| **Public Task** | A personal Task shared with the family: visible on the owner's list and the family page's Public tab; other members read-only | shared task, open task |
| **Family Task** | A task scoped to the Family (family surfaces only); appears on an individual's list only when assigned, keeping its Family label | household task |
| **Visibility** | The three-level scope of a Task — private / public / family; defaults to public for new tasks; owner-only to change | sharing level |
| **Request** | A Task the viewer assigned to someone else; tracked in the Requested tab with status Pending/Accepted/Declined | outgoing assignment |
| **To Accept** | A Task assigned to the viewer still pending their response | incoming assignment |
| **Cursor** | The live occurrence of a Recurring Task; completing snaps the next one to today + n×interval | pointer |
| **Task Priority (top-3)** | see **Top-3 Priorities** | — |
| **Top-3 Priorities** | The Day Dashboard's three most urgent tasks, family-wide, ranked mine-first | my three tasks, must-do trio |
| **Family Task Board** | The Day Dashboard card listing every open family Task grouped by assignee | chore board |

## Bills & Receipts

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Bill** | A tracked expense with title, amount (stored as integer cents), optional due date, and category | invoice, payment |
| **Quick-add** | Typing a natural phrase (e.g. "electric bill $85 due friday") that the parser converts into a prefilled entry the user confirms | smart add |
| **Parse Intent** | The structured result of parsing a quick-add phrase; a hint to prefill, never a commit | parsed result |
| **Receipt** | A photo of a paper bill, PROCESSED AND DELETED: parsed on-device into text/numbers, never uploaded or stored | — |
| **Receipt Scan** | On-device extraction (OCR chain) of merchant, total, date, and line items from a receipt photo | OCR pass |
| **OCR Chain** | The ordered engine fallback: Chrome Prompt API → native bridge (ML Kit/iOS Vision, future) → tesseract.js → opt-in Azure cloud scan | engine ladder |
| **Line Item** | One row of a parsed receipt (label, price, category), saved as text only — the image is gone | entry |
| **Label** | A user-assigned category on a Bill or Line Item | tag, classification |
| **Tag Table** | The learning store mapping merchant/item keys to categories, with per-user rows that override and feed the global majority rows | learning store |
| **Scan Confidence** | Whether extraction found a usable merchant/total; poor confidence triggers the opt-in cloud-scan prompt | quality gate |

## Family

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Family Member** | A user holding membership in a Family; permissions ride on **Role**, personal profile on **Member Type** | household user |
| **Role** | Membership permission — `creator \| admin \| member`; creator/admin gate invites, direct-add, child accounts | permission level |
| **Member Type** | Personal-profile label — `'parent' \| 'child' \| 'member'`; not a permission; powers the Kids' Schedule | family role |
| **Member Limit** | Max members in one Family, set by the creator's subscription tier | seat limit |
| **Family Limit** | Number of families a user may create | — |
| **Kids' Schedule** | Today's events with a child attendee, driven by Member Type | children's calendar |

## Day Dashboard

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Day Dashboard** | Per-day at-a-glance page: today's events, Top-3 Priorities, Family Task Board, Kids' Schedule, Member Strip, Meals, Daily Verse | home screen |
| **Dashboard Module** | One card on the Day Dashboard; family-level enable switch (admin) + per-user hide | widget, tile |
| **Daily Verse** | A scripture verse rendered per day, gated by `showDailyVerse`, in the user's `verseTranslation` | verse of the day |

## Subscriptions

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Subscription Tier** | `free \| cal_master \| family_master`; sets Family Limit, Member Limit, and attachment/AI limits | plan |
| **Limit Override** | A per-subscription override column (memberLimitOverride, attachmentLimitBytes) taking precedence over tier defaults | boost |

## Relationships

- An **Anonymous Account** becomes permanent through **Claiming**; unclaimed ones die after one **Inactivity Window**
- A **Task** has exactly one **Visibility**; assigning a Task starts a **Request** until the assignee accepts or declines (decline returns it to the assigner)
- A **Family Task** surfaces on an individual's list only when assigned to them
- A **Bill** optionally carries **Line Items**, each with its own **Label**; confirmed labels train the **Tag Table** (user rows override global rows)
- A **Receipt** produces **Line Items** and is then discarded — no image bytes persist anywhere
- **Family Limit** and **Member Limit** are separate: families a user may create vs members in one Family
- An **Event** can have **Tasks** attached

## Example dialogue

> **Dev:** "She assigned him a **Task** — does it show on her list now?"
> **Domain expert:** "It moves to her **Requested** tab with status Pending. He sees it under **To Accept**. If he declines, it bounces back to her."
> **Dev:** "And if the **Task** is a **Family Task**?"
> **Domain expert:** "Same assignment flow — but it lives on family surfaces for everyone, and on his personal list with the Family label."
> **Dev:** "The **Receipt Scan** got the total wrong. Do we keep the photo?"
> **Domain expert:** "Never. **Receipts** are processed and deleted — only the **Line Items** and the corrected fields persist, and her corrections train the **Tag Table** so her next scan predicts her way first."
> **Dev:** "What if the local **OCR Chain** can't read it?"
> **Domain expert:** "The scan shows the opt-in cloud prompt — Azure only, only if the server has the key, and the image still isn't kept by us."

## Flagged ambiguities

- "**family task**" historically meant "any task visible to the family"; resolved into three canonical levels — **Private Task**, **Public Task**, **Family Task** — with **Visibility** as the umbrella term.
- "**assignee/assigner**" vs "owner": in this codebase the assigner is always the creator (owner); "owner" is the canonical term, "assigner" is role-in-context only.
- "**calendar**" was ambiguous between the UI view and the data scope; "personal/family calendar" = data scope, "calendar views" = UI (month/week/day/list).
- "**tag**" overloaded: quick-add `#tags` (free text labels on tasks) vs **Label** (a category assignment on bills/line items). Canonical: `#tag` for quick-add text tags, **Label** for categories.
- "**parse**" vs "**scan**": **Parse Intent** comes from typed text (quick-add); **Receipt Scan** comes from an image via the OCR Chain.
