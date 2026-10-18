# 197 — Schedule the svelte 5.57 migration as its own session

Status: open

Source: #159 closure (2026-10-16). Owner decision: schedule the jump as a dedicated session — not an opportunistic bump.

## Done

- Evidence trail in #159: the 5.57 compiler breaks EventFormModal's Create flow (action-bar `canSubmit` prop never re-evaluates after runes-class model writes — probed at template level, zero POSTs); test-env adaptations for 5.57 were diagnosed and documented (jsdom 30 + TL 5.4.2 + `Element.animate` shim in `vitest-setup-client.ts` — reverted with the svelte pin, reusable as-is).
- Six moderate SSR XSS advisories remain in range but unreachable (audit: no `<svelte:element>`, no contenteditable, no user-data spreads onto HTML elements).

## Needs doing

- Bump svelte + @sveltejs/vite-plugin-svelte to current 5.x (5.57.2+), jsdom → 30, @testing-library/svelte → 5.4.2, re-add the animate shim (see #159 for the exact pieces).
- Fix the legacy-pattern incompatibilities the bump uncovers — the known one: EventFormModal's prop expressions over the runes-class model (`EventFormModel.svelte.ts` getters) must be read through template-tracked references, not closure arrows; sweep the other legacy-mode components for the same shape.
- Full gates: unit suite, svelte-check (39/42 floor), Playwright e2e breadth (auth, calendar add/edit, quick-add multi-date), deploy to test + browser-verify EventFormModal Create + AccountNotifications switches.
- Enforce the recorded rule: never spread user data onto an HTML element (that's what makes the six XSSs live).
