# 200 — /calendar SSR 500: $$render_inner is not defined (legacy-mode compile)

Status: in-progress

Source: bugReports auto-filed 2026-10-22 08:37 + prod logs (ReferenceError stack on every /calendar GET). svelte pinned 5.20.1, kit 2.70.3 — **NOT a version bump**: the SSR break is the legacy-compile pattern triggered by the `+layout.svelte` script.

## Done

- **Repro in a local build (2026-10-22):** `.svelte-kit/output/server/entries/pages/(calendar)/calendar/_layout.svelte.js:30` — the SSR render loop runs `$$render_inner($$inner_payload);` and `$$render_inner` is never defined or imported anywhere in the compiled module (the import line carries only push/store_get/copy_payload/assign_payload/bind_props/pop/unsubscribe_stores/FILENAME/stores/client/Navbar/BottomNav/Toaster/anonymous). The first `GET /calendar*` throws server-side → HTML 500 before hydration.
- **Legacy-compile tells in the same artifact:** the crashing module also carries legacy-mode output — a discarded `$:`-era IIFE (lastActiveAt→daysRemaining, lines 16–20) and discarded `store_get(...) &&` expressions (claimed=1/merged/tasks params, emailVerified, lines 21–24). It was compiled from the committed pre-migration script (dd2412c); the runes migration is uncommitted, running in a parallel lane.
- **Prod blast radius + logs:** prod logs show the same "`$$render_inner` is not defined" stack on EVERY /calendar GET — the group layout is the outermost render for all /calendar routes, so no child page (calendar itself, dashboard, tasks, family hub, notifications) survives it. bugReports auto-filed 2026-10-22 08:37 carry the affected-session evidence.

## Needs doing

- **Fix (in flight, parallel lane):** runes migration of `src/routes/(calendar)/calendar/+layout.svelte`'s script, then rebuild the SSR artifact so the compiled layout ships a defined render path — no bare `$$render_inner` call — and deploy; every /calendar GET back to 200.
- **Regression gate — the acceptance for this ticket:** a build-artifact smoke test asserting the compiled layout contains no bare `$$render_inner` call. File it with the fix and run it after each `vite build` so this failure class cannot land silently again.
