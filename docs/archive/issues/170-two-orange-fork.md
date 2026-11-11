# 170 — Two-orange fork: theme terracotta vs primary ramp both in the corpus

Status: open

Source: UI audit (issue 135), 2026-10-15. Static class reads (no browser in the audit lane); verdicts to the #131 harness.

## Done

- `src/lib/marketing/theme.css:37-38` — canonical `#c45e38` terracotta; `tailwind.config.js:10-22` — primary ramp `DEFAULT #dd5822`.
- `/pricing` emits the primary ramp INSIDE the corpus (`pricing/+page.svelte:59-63,124`), so `deriveTokens` unions both oranges — the fork is invisible to the harness as configured.
- App surfaces on the primary side: calendar FAB (`calendar/+page.svelte:608`), navbar avatar (`Navbar.svelte~64`, precedent `tokens.test.ts:42-55`), dashboard/bottom-nav actives, import CTAs, notifications dots, `/family` CTAs, event header, `/account` chrome.

## Needs doing

- Option A — remove primary from the corpus / pin terracotta (re-measure, rewrite PricingCard, brand call). Cost: re-measure + pricing rewrite. **Until then the harness is green-by-construction on the disputed property — no green claim counts.**
- Option B — bless both oranges in the token set. Cost: fork permanent, blind audits.
- Not choosing (issue 135: forks reported, not decided). Harness verdict after ruling: red → fix → green on the affected routes.
