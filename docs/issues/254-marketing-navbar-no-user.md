# 254 — Marketing pages show "U / User" for signed-in users and hide admin links

Status: open

Source: repo bug audit 2026-11-01 (lane G).

## Evidence

`src/routes/(marketing)/+layout.svelte` `<Navbar isLoggedIn={data.isLoggedIn} />` without `user` though layout.server returns it.

## Repro

Signed in, visit /pricing -> avatar 'U', no name/email/admin links.

## Done

(none yet)

## Needs doing

- Pass `user={data.user}`.
- Red test first where a seam exists (`tdd`).
