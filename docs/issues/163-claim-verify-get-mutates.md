# 163 — Claim-verify token burns on GET (prefetchers consume it)

Status: open

Source: security audit (issue 136), 2026-10-15. Rank 3/16 — any GET (email prefetch, chat unfurl) triggers the single-use merge.

## Done

- `src/routes/(calendar)/claim/verify/[token]/+server.ts:25-43` — token burn + guest merge + email attach all happen on GET. Peek-before-consume helps preview but the mutation still fires.
- Prefetchers/link scanners consume the single-use token and trigger the merge before the user clicks.

## Needs doing

- Option A — move the mutation behind POST on a confirm page (GET previews, POST consumes). Cost: one confirm step for the legit claimer.
- Option B — keep GET but require a live session interaction (button click already implies navigation — distinguish prefetch UA). Cost: UA-sniffing is fragile; prefetchers evolve.
- Not choosing (issue 136).
