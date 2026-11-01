# 258 — /report-bug has no navigation (strands PWA users); no submitting state

Status: open

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/report-bug/` outside groups -> bare root layout; 'Back' only after submit.

## Repro

Installed PWA: open Report a Bug, decide not to send -> no way out.

## Done

(none yet)

## Needs doing

- Add a Back link/header; disable button while submitting.
- Red test first where a seam exists (`tdd`).
