# 248 — Family detail page does not update after remove/role change/rename

Status: open

Source: repo bug audit 2026-11-01 (lane F).

## Evidence

`src/routes/(family)/family/[familyId]/+page.svelte:27` `const { family, members, ... } = data`.

## Repro

Remove member -> toast, row stays until hard reload.

## Done

(none yet)

## Needs doing

- Make derived from `data` (and `isAdmin`).
- Red test first where a seam exists (`tdd`).
