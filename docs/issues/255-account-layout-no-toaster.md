# 255 — /account has no Toaster (export feedback lost) and no bottom nav

Status: open

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/(calendar)/account/+layout.svelte` renders only Navbar + slot; `AccountDangerSection.svelte:19,30,33` pushToast.

## Repro

Export data -> no feedback, failure silent; no bottom tabs on phone.

## Done

(none yet)

## Needs doing

- Add `<Toaster />` and `<BottomNav isLoggedIn />` with bottom padding.
- Red test first where a seam exists (`tdd`).
