# 261 — Error page claims "we've been notified" for 4xx and hides the reason

Status: done

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/+error.svelte` ignores `$page.error.message`; handleError only runs for unexpected errors.

## Repro

Open an event you can't access -> 'Something went wrong — we've been notified' instead of 'No access to this event'.

## Done

- `src/routes/+error.svelte`: non-404 4xx now titled "We can't open that" with `$page.error.message` as the body (e.g. "No access to this event"); no "we've been notified" copy, no report CTA. 404 copy unchanged. 5xx keeps notified copy + "Add details to the report", which now links `/report-bug?from=<path>` (#257 helper).
- Red-green: new `src/routes/error.svelte.test.ts` (403 shows reason, no notified/CTA; 404 copy; 5xx notified + CTA).

## Needs doing

(none)
