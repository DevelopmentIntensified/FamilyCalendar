# 283 — Category on the remaining task forms + Saved toast on task edit

Status: done

Source: 2026-11-02 leftovers pass.

## Evidence

#280 web lane left `FamilyTaskAddForm` (/family/tasks) and the board quick-add without a category field; EditTaskDialog save shows only 'Saving…' then refreshes, no confirmation (AGENTS.md UI feedback rule).

## Done

- **Category on the two remaining add forms** — 2026-11-02, `fix(283): category field on FamilyTaskAddForm and the board quick-add`.
  - `FamilyTaskAddForm.svelte`: new optional `categories` prop, `CategoryField` (id `family-add-task-category`, compact) under the input row; POST sends `normalizeCategoryInput(...) ?? undefined` (key absent when blank), resets after a successful add. Note: the component is not mounted anywhere today (`/family/tasks` has no add form; family tasks are added from `/calendar/tasks` AddTaskCard `@family` or the dashboard board) — the field is ready for whoever mounts it.
  - Dashboard Family Task Board quick-add (`FamilyTaskBoardCard.svelte`): `categories` prop, `CategoryField` (id `board-quick-add-category`) on its own line under the input, same send/reset rule.
  - Loader: `/calendar/dashboard/+page.server.ts` returns `taskCategories` (`listCategoryOptions(userId)`, started before the other reads, never throws → `[]`); `+page.svelte` → `DayDashboard` `taskCategories` prop → board `categories` (names). Prototype variants untouched.
  - Tests: `FamilyTaskAddForm.svelte.test.ts` (+2: listed + sent trimmed + reset; key absent), `FamilyTaskBoardCard.svelte.test.ts` (+2 same), `DayDashboard.svelte.test.ts` (+1 names reach the board), dashboard `page.svelte.test.ts` (+1 loader data → board), `page.server.categories.test.ts` (1, loader returns `taskCategories`).
- **Saved / error toast on task edit** — 2026-11-02, `fix(283): Saved "<title>" / error toast on task edit save`.
  - `$lib/client/taskEditSave.ts` `saveTaskEdit(task, draft, viewerId)`: builds the payload (`buildEditPayload`), PUTs, returns `{ ok, message }` (+ bare `error` on failure). Copy: `Saved "<title>".` (server-stored title preferred); `Couldn't save "<title>" — <server reason>` / `— try again.` / `— check your connection.`
  - `/calendar/tasks` and `/family/tasks` `saveEdit` push that toast; `editSaving` pending state ('Saving…', disabled), close-on-success and `invalidateAll` unchanged; `/calendar/tasks` keeps its inline `actionError` alert too.
  - Tests: `taskEditSave.test.ts` (5), `calendar/tasks/page.svelte.test.ts` (+2), `family/tasks/page.svelte.test.ts` (+2: success toast + dialog closes; failure toast + dialog stays).
- Full vitest green except `*.real.test.ts` (no Postgres); `npm run build` green; svelte-check: no errors in touched files.

## Needs doing

- (none)
