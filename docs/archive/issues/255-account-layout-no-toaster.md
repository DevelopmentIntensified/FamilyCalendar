# 255 — /account has no Toaster (export feedback lost) and no bottom nav

Status: done

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/(calendar)/account/+layout.svelte` renders only Navbar + slot; `AccountDangerSection.svelte:19,30,33` pushToast.

## Repro

Export data -> no feedback, failure silent; no bottom tabs on phone.

## Done

- `(calendar)/account/+layout.svelte` now renders `<Toaster />` and `<BottomNav isLoggedIn />`; slot wrapped in `pb-20 md:pb-0` so content clears the phone tab bar.
- Red-green: new `src/routes/(calendar)/account/layout.svelte.test.ts` (pushToast message appears; Primary navigation present).

## Needs doing

(none)
