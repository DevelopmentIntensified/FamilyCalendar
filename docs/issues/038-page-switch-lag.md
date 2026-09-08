# 038 — Page-switch lag (keyed layout remount + fade transitions)

Status: done

## Done

- Root cause: 4 group layouts wrapped `<main><slot /></main>` in
  `{#key pathname}` with `in:fade`/`out:fade`. Every navigation destroyed
  and rebuilt the whole page DOM, gated behind 50–100ms outro + 100–300ms
  intro (marketing: 200ms delay + 300ms intro = ~600ms perceived lag).
- Removed `{#key pathname}` from all 4 layouts — SvelteKit swaps page
  content natively, no forced remount:
  - `src/routes/(bills)/+layout.svelte`
  - `src/routes/(calendar)/calendar/+layout.svelte`
  - `src/routes/(family)/+layout.svelte`
  - `src/routes/(marketing)/+layout.svelte`
- Fade kept as first-mount-only polish: `in:fade|local` on a plain div
  around `<slot />` (100ms app groups, 150ms marketing — delay dropped).
  No `out:` transition, so navigation never waits on animation.
- Removed dead `$: pathname = data.pathname` from all 4 layouts (was only
  feeding the key). `+layout.server.ts` files still return `pathname` —
  harmless, trim later if desired.
- Gates: `npm run build` green (after both edit rounds).

## Needs doing

- Follow-ups (NOT started, separate slices): parallelize sequential
  `guard()` awaits in bills/calendar `+page.server.ts`; dedupe double
  `getUserSettings` (calendar layout + page both fetch); extract bills
  scan/draft/import panels out of the 1542-line page + dynamic-import OCR
  modules on file-pick; virtualize long bill/task lists.
