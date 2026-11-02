# 259 — Calendar banners cover the toolbar (fixed mt-10 offset)

Status: done

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/(calendar)/calendar/+layout.svelte` `<main>` gets `mt-10` regardless of banner stack height.

## Repro

Unverified user / offline at 375px -> toolbar hidden under banner.

## Done

- `(calendar)/calendar/+layout.svelte`: banner stack (plain `<div>`, per #200) gets `bind:clientHeight={bannerHeight}`; `<main>` drops the fixed `mt-10` and uses `style:margin-top` = measured height (falls back to 40px pre-measure/SSR when a banner shows). `print:!mt-0` still wins on print.
- SSR sanity: compiled server output has no settle loop (no component `bind:`).
- Red-green: new `src/routes/(calendar)/calendar/layout.svelte.test.ts` (stubs ResizeObserver, sets stack clientHeight 132 -> main margin-top 132px, no `mt-10`).

## Needs doing

(none)
