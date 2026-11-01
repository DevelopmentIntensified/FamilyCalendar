# 254 — Marketing pages show "U / User" for signed-in users and hide admin links

Status: done

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/(marketing)/+layout.svelte` `<Navbar isLoggedIn={data.isLoggedIn} />` without `user` though layout.server returns it.

## Repro

Signed in, visit /pricing -> avatar 'U', no name/email/admin links.

## Done

- `(marketing)/+layout.svelte` now passes `user={data.user}` to `Navbar` (layout.server already returned it).
- Red-green: new `src/routes/(marketing)/layout.svelte.test.ts` asserts the navbar shows the first name (not "User") and the mobile menu shows admin links for an admin.

## Needs doing

(none)
