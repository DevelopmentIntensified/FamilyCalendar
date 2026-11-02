# 252 — Signed-out account form posts show an empty red banner

Status: done

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`requireUserAction` returns `{error}`; `account/+page.svelte:76` renders `form.message`.

## Repro

Session expired, submit any account form -> blank red banner.

## Done

- `account/+page.svelte`: banner text = `form.message ?? form.error`, with a generic fallback so the banner is never blank. New `account/page.svelte.test.ts` (`{error:'Not signed in'}` renders its text; `{message}` failures unchanged).

## Needs doing

(none)
