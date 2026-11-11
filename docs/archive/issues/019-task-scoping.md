# 019 — Task scoping: public / private / family

Status: done

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

## Done

- Slice 1 (commit a4cb9be): `tasks.visibility` + `sql/008-task-visibility.sql`
  (applied to both local DBs), section queries (getMyTasks /
  getPendingAssignments / getRequestedByMe / getPublicTasksForFamily /
  getFamilyTasksAssignedTo), canMutateTask personal rules (owner + live
  assignee only; public read-only for members), canChangeVisibility
  owner-only, API visibility validation (400/404/403), visibility in all
  task JSON. Suite 1139 green.
- Slice 2 (commit ebd8b45): tasks page filter chips (All/Public/Private/
  Family) + search, tabbed Assignments card (To accept inline
  Accept/Decline; Requested badges), owner-only visibility picker in
  create/edit, per-chip empty states; family tasks pages got
  Family/Public tabs (public rows creator-labeled, read-only); NLP
  quick-add `#public`/`#private`/`@family`/`@name` (23-case table, 117
  file tests; unknown member never silently dropped) + reusable
  TaskQuickAddHelp "?" panel; explicit `familyId: null` on personal
  creates (POST default would silently family-scope).
- Gates: unit 1162/81 files, e2e mobile/family/events green, check/
  oxlint/prettier 0, build pass, autofixer clean on edited components.

## Notes / follow-ups

- `sql/008` on Neon: run ONCE (ALTER idempotent; UPDATE is one-shot).
- Legacy `tasks` load field on calendar/tasks now unused — drop when
  convenient.
- Assigner is always owner in this schema (no ownership transfer on
  accept) — spec collapsed "assigner" to owner accordingly.
