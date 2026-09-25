# 062 — Per-page style reliability + compression

Status: done

## Needs doing

- Compression side: measure per-page CSS payload; skip utilities-splitting
  unless the single-global number shows real dead weight. (Tailwind is JIT —
  unused utilities are already absent; the remaining ~80KB global is reachable
  classes, replicated per build hash.)
- Cleanup: `(calendar)/account/+layout.svelte` still has its own layout —
  works under the root import now; no action unless regressed.

## Done

- ROOT CAUSE (user-confirmed symptom: admin + account were "the biggest issue
  ones"): there was NO root `+layout.svelte`. Four route groups each imported
  `app.css` separately, BUT `(admin)` and `(calendar)/account` imported
  nothing — their pages rendered with whatever leaked via shared chunks
  (Toaster), i.e. sometimes literally nothing global. Fixed by adding
  `src/routes/+layout.svelte` (single global import) and dropping the four
  per-group `app.css` imports.
- Verified on the built app (vite preview + real browser): every served page
  (home, /login, admin login) loads EXACTLY ONE global stylesheet
  (`_app/immutable/assets/0.*.css`, 79KB) — the dual ~80KB copies are gone;
  two files remain on disk only because SvelteKit ships per-node css for
  hydration, each page still fetches one stylesheet.
- Full story: reliability root cause = missing css on admin/account + admin
  pages previously got styles only by Toaster-chunk luck. Now the root layout
  guarantees availability on every page, and the tailwind JIT output is
  identical content served once.
- CLOSED (2026-09-25, user: "you fixed 062 already"): compression slice added.

