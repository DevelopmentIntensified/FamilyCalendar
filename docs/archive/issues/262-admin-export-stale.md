# 262 — Admin export text keeps resolved rows; Copy gives no confirmation

Status: done

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`(admin)/admin/bugs/+page.svelte` and `admin/nlp/+page.svelte:20` `let exportText = …` non-reactive.

## Repro

Resolve 2 bugs, Export, Copy -> resolved rows still there.

## Done

- `(admin)/admin/bugs/+page.svelte` + `admin/nlp/+page.svelte`: `let exportText = …` -> `$: exportText = …`, so Resolve (enhance refresh) drops rows from the export.
- `src/lib/admin/AdminExport.svelte`: Copy toasts "Export copied to clipboard — paste it into your agent." or, on clipboard failure, "Couldn't copy — text is selected, press Ctrl/Cmd+C." via `pushToast`; `(admin)/+layout.svelte` now renders `<Toaster />` (none was mounted there).
- Red-green: new `src/routes/(admin)/admin/bugs/page.svelte.test.ts` (rerender with fewer rows -> export updates, bugs + nlp); `AdminExport.svelte.test.ts` copy-success and copy-blocked toast tests.

## Needs doing

(none)
