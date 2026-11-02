# 283 — Category on the remaining task forms + Saved toast on task edit

Status: open

Source: 2026-11-02 leftovers pass.

## Evidence

#280 web lane left `FamilyTaskAddForm` (/family/tasks) and the board quick-add without a category field; EditTaskDialog save shows only 'Saving…' then refreshes, no confirmation (AGENTS.md UI feedback rule).

## Done

(none yet)

## Needs doing

- Reuse `CategoryField` + payload helpers in both forms; push a 'Saved "<title>"' toast after a successful edit (and error toast on failure). Tests.
