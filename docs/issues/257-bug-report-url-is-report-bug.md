# 257 — Bug reports record /report-bug as the URL

Status: open

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/report-bug/+page.server.ts` uses POST referer (always /report-bug).

## Repro

Bug on /calendar/tasks -> admin shows 'at …/report-bug'.

## Done

(none yet)

## Needs doing

- Links carry `?from=<path>`; hidden input `from`; store it.
- Red test first where a seam exists (`tdd`).
