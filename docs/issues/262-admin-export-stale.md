# 262 — Admin export text keeps resolved rows; Copy gives no confirmation

Status: open

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`(admin)/admin/bugs/+page.svelte` and `admin/nlp/+page.svelte:20` `let exportText = …` non-reactive.

## Repro

Resolve 2 bugs, Export, Copy -> resolved rows still there.

## Done

(none yet)

## Needs doing

- `$: exportText = …`; 'Copied' toast.
- Red test first where a seam exists (`tdd`).
