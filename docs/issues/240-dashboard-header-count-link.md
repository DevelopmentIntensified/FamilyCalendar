# 240 — Dashboard: Family Task Board count and Today empty-state link mislabelled

Status: open

Source: repo bug audit 2026-11-01 (lane D).

## Evidence

`FamilyTaskBoardCard.svelte:172` shows `glance.openToday` (viewer's due-today) as board open count; `TodayGlanceCard.svelte:140` `href="/calendar?view=day"` ignores viewed date.

## Repro

Board lists 8, header says '2 open'; dashboard for Nov 5 -> 'Open day view' lands on today.

## Done

(none yet)

## Needs doing

- Pass board open total; link `/calendar?date=<day>&view=day`.
- Red test first where a seam exists (`tdd`).
