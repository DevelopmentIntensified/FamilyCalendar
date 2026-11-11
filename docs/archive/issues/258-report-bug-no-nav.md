# 258 — /report-bug has no navigation (strands PWA users); no submitting state

Status: done

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/report-bug/` outside groups -> bare root layout; 'Back' only after submit.

## Repro

Installed PWA: open Report a Bug, decide not to send -> no way out.

## Done

- `report-bug/+page.svelte`: "← Back" link (44px target) above the form, pointing at the originating page (`from`, #257) or `/calendar`.
- Submit button disabled + "Submitting…" while the enhanced POST is in flight (reset in `finally`).
- Red-green: `page.svelte.test.ts` — Back href = from, Back fallback `/calendar`, button disabled after enhance submit fires.

## Needs doing

(none)
