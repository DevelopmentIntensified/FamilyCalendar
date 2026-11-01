# 261 — Error page claims "we've been notified" for 4xx and hides the reason

Status: open

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/+error.svelte` ignores `$page.error.message`; handleError only runs for unexpected errors.

## Repro

Open an event you can't access -> 'Something went wrong — we've been notified' instead of 'No access to this event'.

## Done

(none yet)

## Needs doing

- For status < 500 show message; drop notified copy + report CTA.
- Red test first where a seam exists (`tdd`).
