# 004 — Bill CRUD

Status: done

## Done

- `bills` table (integer cents, category vocab, paid cursor column for #007);
  SQL recorded in `sql/004-bills.sql`, applied to local Docker DB.
- Actions (`bills.ts`): boundary parsers, pure `canMutateBill`
  (owner or creator/admin), CRUD; shared `getFamilyMemberRole` seam in
  `families.ts`; `getBillsForUser` covers family + personal bills.
- API `GET/POST /api/bills`, `PUT/DELETE /api/bills/[id]` with injectable
  deps (no module mocks); 400/401/403/404 behavior pinned.
- Minimal `/calendar/bills` page: create form (dollars in, cents stored),
  list with per-bill amounts, delete; toasts + inline errors, navbar link
  (BottomNav untouched — 5-tab e2e pin).
- 47 unit/API tests + `e2e/bills/BillsCrud.test.ts` green against local DB.
- Gates: check 0/0, eslint 0, oxlint 0/0, prettier clean, build clean.

## Needs doing

- (nothing — #005 unblocked)

Parent: #003 Bill Tracking PRD (stories 1, 10).

## Done

- (nothing yet)

## Needs doing

- What to build: `bills` table (family + creator, title, amount in integer
  cents, due date, category from closed vocabulary, paid flag) with SQL
  migration recorded alongside; CRUD API role-gated (creator/admin write,
  member read); minimal bills list UI with optimistic ack + toast per UI
  feedback rule.
- Acceptance criteria:
  - [ ] Migration SQL recorded in `sql/` + issue notes; `db:push` clean locally.
  - [ ] Parent creates/edits/deletes a bill; member sees read-only.
  - [ ] Amounts stored/returned as integer cents; no float math anywhere.
  - [ ] Unit + API tests green; `npm run build` clean.

Blocked by: none — start immediately.
