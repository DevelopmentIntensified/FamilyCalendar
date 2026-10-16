# 195 — Bare Something went wrong fallbacks (usability #9)
Status: open
Source: ui-design-principles audit (usability #9), 2026-10-16. Bug — fix without asking per the skill.
## Done
- `EventFormModal.svelte:380,388,429,479` and `EventModal.svelte:256,295` fall back to `Something went wrong. Try again.` when the server returns no message — no what (creating vs saving vs duplicating; VPN/auth vs field error), no next step.
## Needs doing
- Per-surface what + next copy (creating vs saving vs duplicating). Follow the repo toast pattern (names what happened + next).
