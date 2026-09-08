# 036 — Bills parked as own sub-app section

Status: done

## Done

- New route group `src/routes/(bills)/` with own minimal chrome:
  `+layout.svelte` (Navbar + OfflineBanner + Toaster + "← Back to
  Calendar" link, NO BottomNav — parked outside main-app nav) and
  `+layout.server.ts` (same auth guard as the calendar group layout:
  redirect 302 /login when no user, else user + userSettings).
- Moved with history (git mv renames):
  - `src/routes/(calendar)/calendar/bills/` → `src/routes/(bills)/bills/`
    (+page.svelte, +page.server.ts, page.svelte.test.ts) — new URL `/bills`
  - `src/routes/(calendar)/calendar/spending/` → `src/routes/(bills)/spending/`
    (+page.svelte, +page.server.ts, page.svelte.test.ts) — new URL `/spending`
- In-moved-file edits ONLY: goto/href path swaps
  (`/calendar/bills?month=` → `/bills?month=`, `/calendar/spending` link →
  `/spending`, `/calendar/spending?...` → `/spending?...`) + the 2 goto
  expectations in the spending colocated test. No logic/behavior touched.
- Redirect stubs at old URLs (bookmarks + deployed links):
  `(calendar)/calendar/bills/+server.ts` GET → 301 `/bills`,
  `(calendar)/calendar/spending/+server.ts` GET → 301 `/spending`.
- Stripped main-app surfaces: Bills entry in
  `src/lib/components/Navbar.svelte:50` (loggedInNavItems). BottomNav,
  dashboard, empty states had zero bills links — nothing else to strip.
  Breadcrumbs inside the bills pages still link back to /calendar (exit
  link, not an entry point).
- Untouched: all /api/\* routes, src/lib/\*\* services, DB schema/actions,
  email-ingest, issues 029-035, /changelog history. Roadmap: one line —
  `src/lib/data/roadmap.ts` Bill tracking item notes bills maturing as
  their own section.
- Tests: e2e/bills/\* gotos → new URLs (/bills, /spending,
  /spending?range=all); e2e dir itself stays. Colocated unit tests moved
  with pages; no other unit test imports the moved modules by path
  (relative `./+page.svelte` imports moved along).
- Gates: vitest 2063 passed / 1 failed (azureReceiptService timeout —
  pre-existing, file untouched by this change; listed known flake),
  e2e/bills 5/5 green at new URLs (BillsCrud 3, PdfRealReceipt 1,
  SpendingReports 1; one parallel-contention flake on the drill-down in a
  parallel run, green solo + serial), oxlint 0, prettier --write clean,
  `npm run check` 0 errors, `npm run build` green. Redirect evidence:
  curl localhost:4173 → /calendar/bills 301 → /bills,
  /calendar/spending 301 → /spending.

## Needs doing

- None. Follow-up ideas (not committed): BottomNav entry for Bills if
  the parked section should be reachable on mobile chrome; deep-link
  audit of deployed /calendar/bills URLs after redirect bake-in.
