# 260 — Verify-email banner form overflows at 320px

Status: done

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

Same layout: `<form class="flex w-full items-center justify-center gap-2">` no wrap; ~322px content in 288px.

## Repro

Unverified user on 320px device -> horizontal scroll.

## Done

- Verify-email banner form (`(calendar)/calendar/+layout.svelte`): `flex-wrap` on the form; code input `w-40` -> `min-w-0 max-w-40 flex-1 basis-32` so it shrinks/wraps instead of pushing ~322px into 288px at 320px.
- Red-green: `src/routes/(calendar)/calendar/layout.svelte.test.ts` "wraps and lets the code input shrink" (jsdom has no layout; asserts the wrap/shrink classes).

## Needs doing

(none)
