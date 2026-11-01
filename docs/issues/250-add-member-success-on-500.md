# 250 — Add-member tabs show success when the server errors

Status: open

Source: repo bug audit 2026-11-01 (lane F).

## Evidence

`MemberChildTab.svelte:30-34`, `MemberSearchTab.svelte:77-81`, `MemberInviteTab.svelte:35-39` only check `json.error`; SvelteKit 500 body is `{message}`.

## Repro

Server throw -> 'Member Added!'.

## Done

(none yet)

## Needs doing

- Check `!res.ok || json.error`; fallback `json.message ?? 'Something went wrong'`.
- Red test first where a seam exists (`tdd`).
