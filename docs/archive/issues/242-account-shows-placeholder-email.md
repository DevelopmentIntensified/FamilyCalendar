# 242 — Account settings show placeholder address to guests; guest guard never fires

Status: done

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`AccountSidebar.svelte:125`, `AccountEmailSection.svelte:33`, `account/+page.server.ts:437` (`!currentUser.email`).

## Repro

Guest sees `abc123@anonymous.placeholder.invalid`; change-email flow instead of claim link.

## Done

- `account/+page.server.ts` `updateEmail`: guest guard uses `isRegisteredAccount` (#241 helper) — placeholder-email guests get `guestNeedsClaim`, never mailed. Test in `account/page.server.test.ts`.
- `AccountSidebar.svelte`: guests see "No email yet · Save your calendar" (`/claim`) instead of the placeholder. Tests in `AccountSidebar.svelte.test.ts`.
- `AccountEmailSection.svelte`: guests get "No email yet" + claim link, no change-email form. New `AccountEmailSection.svelte.test.ts`.
- Same bug in `NavbarProfileMenu.svelte` (`{#if user?.email}` printed the placeholder in the profile header) — now gated on `isRegisteredAccount`. Test in `NavbarProfileMenu.svelte.test.ts`.

## Needs doing

(none)
