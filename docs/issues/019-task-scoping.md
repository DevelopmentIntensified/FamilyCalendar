# 019 — Task scoping: public / private / family

Status: in-progress

## Decisions (user-approved)

- Three levels: **private** (owner + assignee + assigner only), **public**
  (owner's list + family page Public tab, read-only for other members),
  **family** (`familyId` set; family surfaces only; on a personal list
  only when assigned, keeps Family label).
- `tasks.visibility` text `'public'|'private'`, default **public** for
  NEW tasks; **existing personal rows backfilled to private** (one-shot
  UPDATE — not idempotent, run once).
- Assignment works on all levels; assign → assignee sees it (To accept
  while pending), assigner keeps sight (Requested); decline → back to
  assigner (assignedTo null — existing mechanism).
- Accept → task becomes assignee's (moves into My tasks).
- Public tasks: non-assignee family members read-only; visibility toggle
  owner-only.
- NLP: `#public`/`#private` tags, `@family` for family task, `@name` to
  assign to a member; combinable; default public. TDD exhaustive phrase
  table; parser floor (~94 tests) stays green.

## UI spec

- Tasks page: ONE list with single-button filter chips (All / Public /
  Private / Family) + search. Family filter = family tasks assigned to
  me, labeled "Family". Accepted assignments fold into My/Public.
- Separate **Assignments** section with two tabs: **To accept** (pending,
  inline Accept/Decline) / **Requested** (assigned out, status badges).
- Family tasks page: two tabs — **Family tasks** / **Public tasks**
  (creator-labeled).
- Dashboard Family Task Board: family tasks only (unchanged).
- Visibility picker in create + edit (owner only).
- NLP shortcut help: collapsed "?" panel next to smart-add inputs
  listing #public/#private/@family/@name + combinable example; reusable
  component (bills quick-add #011 will reuse). 320px-safe, ≥44px.

## Slices

1. Server (TDD): schema + `sql/008-task-visibility.sql`, section/tab
   queries, `canMutateTask` rules, API visibility + validation.
2. UI: chips + search, assignments tabs, family page tabs, picker,
   NLP + help component.

## Needs doing

- Slice 1 dispatched (server lane).
- Slice 2 after slice 1 lands.
- `sql/008` to Neon after slice 1 (user runs; ALTER idempotent, UPDATE
  one-shot).

## Done

- (nothing yet)
