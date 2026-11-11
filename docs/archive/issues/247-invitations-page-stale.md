# 247 — Invitations page does not update after create/revoke or family switch

Status: done

Source: repo bug audit 2026-11-01 (lane F).

## Evidence

`src/routes/(family)/family/invitations/+page.svelte:9` one-time destructure of `data`.

## Repro

Create code -> toast but list unchanged; revoke -> still shown; switch family pill -> old codes.

## Done

- Red: `invitations/page.svelte.test.ts` "follows fresh data (issue 247)" — rerender with new `data` kept the old code and the create controls (2 failing).
- Fix: `let { ... } = data` -> `$: ({ invitations, family, canManageInvites, memberships } = data);`. Green 16/16.
- Sweep of `src/routes/(family)/**` for the same one-time `= data` capture:
  - `family/+page.svelte` — `let families = data.families; let plan = data.plan;` froze the list after the mint-invite `use:enhance` reload. Now `$:`. Red/green test in `family/page.svelte.test.ts` ("follows fresh data").
  - `family/[familyId]/+page.svelte` — fixed under #248.
  - `family/create`, `family/[familyId]/members/add`, `(family)/+layout.svelte` read `data.*` inline — clean.

## Needs doing

(none)
