# 246 — Login shows raw error codes / success as error / nothing when signed in

Status: open

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`family/invite/email/+page.server.ts:58-78` redirect `?error=invalid_token`; `login/+page.svelte:24-26` prints raw; JOIN_COMPLETE in red; `{#if data.isLoggedIn && !data.mergeMode}` hides notices.

## Repro

Expired invite link -> 'invalid_token' text, or nothing if signed in.

## Done

(none yet)

## Needs doing

- Map codes to copy; success via `?notice=` styled green; render notices in both branches.
- Red test first where a seam exists (`tdd`).
