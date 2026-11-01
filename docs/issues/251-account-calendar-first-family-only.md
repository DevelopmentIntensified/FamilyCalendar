# 251 — Account Calendar section lists only the first family's calendar

Status: open

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`src/routes/(calendar)/account/+page.server.ts:99` `memberships[0]?.family.id`.

## Repro

Member of two families -> second family calendar missing.

## Done

(none yet)

## Needs doing

- Include all memberships.
- Red test first where a seam exists (`tdd`).
