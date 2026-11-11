# 278 — Dashboard 500: subscribing to page store on the server outside a component

Status: done

Source: user bug-report export 2026-11-02 (website, prod www.familyplanz.com — `main` was at 0fbcc93).

## Evidence

[auto-filed 500] "Cannot subscribe to 'page' store on the server outside of a Svelte component…" on /calendar/dashboard (2026-10-27). Some module-level / helper code reads `$app/stores` page during SSR.

## Done

- **Not a code bug on any shipped commit — a `vite dev` artifact.** Both messages exist only in Svelte/Kit DEV code paths, which the prod bundle does not contain:
  - #278's text is thrown by `get_store()` in `@sveltejs/kit/src/runtime/app/stores.js:92-100`, reached only via `DEV ? get_store('page') : getStores().page` (stores.js `page.subscribe`). Prod would throw a different error.
  - #279's `null.function` is `push_element()` in `svelte/src/internal/server/dev.js:59` (`context.function[FILENAME]`), DEV-only element-nesting validation.
  - `npm run build` (Vercel adapter) output: `grep -r "Cannot subscribe to" .svelte-kit/output/server` and `grep -r "context.function\[" …` → no hits; svelte is bundled (not in `.vercel/output/functions/fn.func/node_modules`), so DEV is compiled out. Prod (`www.familyplanz.com`) cannot raise either message.
- **Both together = one cause:** each fires when SSR code runs with `ssr_context === null` *in the Svelte instance the caller imported* while a component is rendering — i.e. two Svelte runtime instances in one Vite dev SSR module graph (compiled components push context into instance A; kit's `getContext`/`push_element` read instance B). Timeline fits: 2026-10-26/27 the owner was reviewing the DEV-only #208 dashboard prototype (`?variant=`, "the owner runs `npm run dev` locally to review", issue 208) and at 11:45 -0400 committed e2c57d5 (npm uninstall of @capacitor/* + adapter-static, 857-line package-lock rewrite) — node_modules changed under a running dev server. A dev server filing into the prod DB (handleError auto-file, `hooks.server.ts:177`) explains the "prod" label.
- **No later fix commit:** the regression test passes on `test` (cb888bd), on 0fbcc93 (prod at export) and on f4cde0b (tip on 2026-10-27, with today's svelte.config) — the dashboard SSR has never failed this way in code.
- **Regression test (new):** `src/routes/(calendar)/calendar/dashboard/page.ssr.test.ts` — server-renders the page exactly as Kit does (generated `root.svelte`, real layout chain root → calendar layout → dashboard page, kit `__svelte__` stores + `__request__` contexts) in DEV mode with every module on and realistic data: streamed (pending) shell, resolved data (all cards), dev prototype variants A/B/C, and back-to-back renders. Red-proved: a module-scope `get(page)` planted in `src/lib/utils/navItems.ts` (imported by Navbar/BottomNav) fails the suite with the exact #278 message; reverted.
- **If it recurs locally:** stop `vite dev`, `rm -rf node_modules/.vite`, restart after any `npm install/uninstall`.

## Needs doing

(nothing — optional follow-up: tag auto-filed reports from `dev` servers so they aren't triaged as prod 500s)
