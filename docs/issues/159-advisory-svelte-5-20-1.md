# 159 — Advisory: svelte 5.20.1 — six SSR XSS advisories, in range, not reachable today

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 13/15 — moderate SSR XSS advisories; usage audit shows no reachable trigger, cheap to clear anyway.

## Done

- Installed 5.20.1 (package-lock; range `^5.0.0`). `npm audit` flags `svelte` moderate, range `<=5.55.6` (current 5.57.1). Six advisories, all SSR-side unless noted:
  - GHSA-crpf-4hrx-3jrp / GHSA-f7gr-6p89-r883 / GHSA-pr6f-5x2q-rwfp — spread-attribute XSS in SSR (fixed ≤5.51.4 / ≤5.55.6).
  - GHSA-m56q-vw4c-c2cp — `<svelte:element>` dynamic tag not validated (fixed ≤5.51.4).
  - GHSA-phwv-c562-gvmh — `bind:innerText` / `bind:textContent` XSS (fixed ≤5.53.4).
  - GHSA-rcqx-6q8c-2c42 — DOM clobbering of framework internal state (client-side, fixed ≤5.55.6).
- Reachability audit: `<svelte:element>`, `contenteditable`, `bind:innerText/textContent` — zero matches in `src/**/*.svelte`. Spread usage — only 5 sites, all static marketing constants onto components: `pricing/+page.svelte:96`, `features/+page.svelte:172,192,227,247`. No user-data spread onto HTML elements → **not reachable today**.
- Server-side rendering is live (Vercel SSR), so a future user-data spread would be exploitable immediately.

## Needs doing

- Option A — upgrade `svelte` to 5.57.1 (devDep bump + rebuild; SSR output changes with the compiler). Cost: minor compiler-output differences; run unit + Playwright suite, deploy test branch.
- Option B — accept (unreachable), document "no user-data spreads on HTML elements" as a rule. Cost: any future `{...userData}` on an element silently reintroduces moderate XSS; advisories stay open in `npm audit`.
- Not choosing (issue 136).
