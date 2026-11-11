# 171 — Tracking + gray-ramp drift vs the marketing token set

Status: open

Source: UI audit (issue 135), 2026-10-15. Static class reads; harness verdicts after the #170 ruling.

## Done

- `tracking-widest` (1.1px ≈ `.1em`): settings rail head (`AccountSidebar.svelte:55`), stats eyebrow (`stats/+page.svelte:45`), print title (`print:81`), `/family` dts + wide rails, account heads — vs marketing `-0.4px/0.35px` (`tokens.test.ts:46-55`). Token-legal but semantic drift (eyebrow vs body tracking).
- `tracking-wide` heads/chips: groceries (`groceries:582,601,623,843`), family band title, account section heads.
- Gray ramp outside the marketing palette: groceries grays (`593,601,631,827,842`), event-page rows (`event/[id]:241,280,324,344,425`), print discs, stats hero `from-orange-50`, orange-700 chip, mint-200 bars (not in `theme.css:44-53`).
- Container radii: event page `rounded-lg` + rows `rounded-md` vs marketing `2xl/3xl/full`; `+error.svelte` `rounded-2xl` shape-clean, amber/slate discs need harness verdict.

## Needs doing

- Option A — per-role eyebrow rule (label which tracking belongs on eyebrows vs body). Cost: labelling pass.
- Option B — accept any in-corpus value. Cost: permanent drift.
- Gray-ramp + radius rows: run the route through `findDeviations` after #170, fix red → green. Not choosing the fork (issue 135).
