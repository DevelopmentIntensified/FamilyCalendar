# 278 — Dashboard 500: subscribing to page store on the server outside a component

Status: open

Source: user bug-report export 2026-11-02 (website, prod www.familyplanz.com — `main` was at 0fbcc93).

## Evidence

[auto-filed 500] "Cannot subscribe to 'page' store on the server outside of a Svelte component…" on /calendar/dashboard (2026-10-27). Some module-level / helper code reads `$app/stores` page during SSR.

## Done

(none yet)

## Needs doing

- Reproduce (test-first) on `test`; if already fixed by a later commit, say which and add a regression test; else fix.
