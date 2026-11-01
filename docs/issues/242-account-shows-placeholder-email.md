# 242 — Account settings show placeholder address to guests; guest guard never fires

Status: open

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`AccountSidebar.svelte:125`, `AccountEmailSection.svelte:33`, `account/+page.server.ts:437` (`!currentUser.email`).

## Repro

Guest sees `abc123@anonymous.placeholder.invalid`; change-email flow instead of claim link.

## Done

(none yet)

## Needs doing

- Use `isAnonymousAccount` in all three; show 'No email yet' + claim link.
- Red test first where a seam exists (`tdd`).
