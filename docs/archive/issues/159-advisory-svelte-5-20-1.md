# 159 — Advisory: svelte 5.20.1 — six SSR XSS advisories, in range, not reachable today

Status: done

Source: security audit (issue 136), 2026-10-06. Rank 13/15 — moderate SSR XSS advisories; usage audit shows no reachable trigger, cheap to clear anyway.

## Done

- **Option B chosen (accepted, documented rule): stay on svelte@5.20.1.** The jump to 5.57.2 broke a real user path under the new compiler: EventFormModal's Create flow — the sticky action bar's `canSubmit` prop never re-evaluated after the runes-class model's `applyNlpResult` (bar stuck disabled, zero POSTs; probed at template level). Six moderate SSR XSS advisories stay in range but are UNREACHABLE per the audit (no `<svelte:element>`, no contenteditable, no user-data spreads onto HTML elements — only 5 static marketing spreads).
- **Rule going forward: never spread user data onto an HTML element** — that single pattern is what would make these advisories live.
- The svelte jump needs a dedicated migration lane with browser-level verification of the modal/quick-add surfaces; filed alongside future wave work. (Test-env fallout of the bump was already diagnosed and fixed where the bump was kept: kit/vite/jsdom paths.)

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
