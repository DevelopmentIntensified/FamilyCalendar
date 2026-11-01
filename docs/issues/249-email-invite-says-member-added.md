# 249 — Email invite shows "Member Added!" when only an email was sent

Status: open

Source: repo bug audit 2026-11-01 (lane F).

## Evidence

`MemberInviteTab.svelte:35-39` -> `onSuccess()` -> `members/add/+page.svelte:43-62` 'Member Added!'.

## Repro

Send invite -> 'The new member has been added' but they are not in the family.

## Done

(none yet)

## Needs doing

- Own success state: 'Invite sent to {email} — they join when they open it (expires in 24h).'
- Red test first where a seam exists (`tdd`).
