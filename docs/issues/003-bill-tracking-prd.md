# 003 — Bill Tracking PRD ("where da money go")

Status: open

## Done

- (nothing yet)

## Needs doing

- Slice issues #004–#008 carry the work; this PRD is the parent reference.

## Problem Statement

Families pay bills from memory, scattered autopay emails, and whoever happens to
remember. Nobody can answer "what do we pay each month in total" or "is the
electric bill due this week" without digging. Rocket Money answers this for
individuals via bank sync; families need the shared, visible version — both
parents see the bills, the totals, and the due dates, next to the calendar that
already runs the household.

## Solution

Bill tracking as a native Family Planz module: bills are date-driven records
(title, amount, due date, category, family-visible) that render on the calendar,
recur like events, roll up into a monthly total on the Day Dashboard, remind
before due dates, and carry receipt photos. Manual entry first; no bank sync.

## User Stories

1. As a parent, I want to add a bill with title, amount, and due date, so that
   it exists in one shared place.
2. As a parent, I want bills to appear on the family calendar on their due
   dates, so that due dates are visible next to everything else.
3. As a parent, I want monthly bills (rent, electric, subscriptions) to recur
   automatically, so that I only enter them once.
4. As a parent, I want a monthly total of all bills, so that I can answer
   "what do we pay each month".
5. As a parent, I want per-category totals (housing, utilities, subscriptions),
   so that I can see where the money goes.
6. As a parent, I want a reminder before a bill is due, so that nothing is
   paid late.
7. As a parent, I want to mark a bill paid for the current period, so that the
   household knows its status.
8. As a parent, I want to attach a receipt photo to a bill, so that proof of
   payment is findable.
9. As a parent, I want to see paid vs unpaid bills for the month, so that I
   know what's left.
10. As a family admin, I want bills visible to the whole family but editable
    only by parents, so that kids see awareness without destructive access.
11. As a user, I want bill amounts in my own display only (no per-member
    breakdown needed in v1), so that scope stays shippable.
12. As a parent, I want to quick-add a bill from a phrase ("electric $120 due
    friday"), so that entry matches the app's quick-add habit.

## Implementation Decisions

- **Bill record**: new table (`bills`) keyed to family + creator: title,
  amount (integer cents — never float), due date, optional category from a
  closed vocabulary (housing, utilities, subscriptions, insurance, other),
  paid status per period. SQL migration recorded alongside, per repo rule.
- **Recurring bills**: reuse the recurrence value objects and expansion
  semantics from Recurring Events (frequency + interval, virtual expansion at
  read time) rather than inventing a second scheduler. Paid status is the
  per-period cursor, mirroring the Recurring Task cursor (one live period at a
  time; marking paid advances it).
- **Calendar overlay**: bills read through the same calendar query path as
  events so due dates render as chips; visually distinct from events.
- **Monthly total card**: a new Dashboard Module id following the existing
  master-switch + per-user-hide contract; pure composition over the bills
  query, no new model.
- **Reminders**: due-soon rows written into the existing in-app notifications
  table; reuse the notification display path. A scheduled job or due-date
  check on read (decision at slice time; prefer read-time check to avoid new
  cron surface).
- **Receipts**: reuse the attachment limit/seeding seam
  (`attachmentLimitBytes`, plan-gated) — bills reference stored attachments,
  no new storage layer.
- **Permissions**: family role-gated (creator/admin write; member read),
  consistent with existing Family Member role semantics.
- **Quick-add**: extends the existing NLP parse pipeline with amount + due
  cues; table-driven phrase suite, parser floor stays green.
- **Out of explicit scope**: bank/plaid sync, autopay detection, per-member
  splits ("settle up"), forecasting, multi-currency (single household
  currency assumed; assumption to confirm).

## Testing Decisions

- A good test pins external behavior (bill due on the calendar, total math,
  reminder fired) not implementation (SQL shape, component internals).
- TDD per repo rule; table-driven suites for amount/date parsing and total
  rollups; e2e for the calendar overlay + duplicate/paid flows, mirroring the
  RecurringEvents regression spec.
- Prior art: natural-language parser suites, RecurringWins e2e, dashboard
  module visibility tests.

## Out of Scope

- Bank account connections / transaction import (Plaid etc.)
- Automatic subscription detection or cancellation
- Splitwise-style settle-up between members
- Budgets-as-limits with enforcement; forecasting
- Multi-currency; tax reporting

## Further Notes

- Terminology to add to CONTEXT.md when slice 1 lands: **Bill** (dated
  amount owed, family-visible), **Billing Period** (one live period per
  recurring bill — the paid cursor), **Monthly Burn** (sum of bills due in a
  calendar month).
- If bank sync is ever wanted, it becomes a separate service feeding the
  bills table — never a rewrite.
