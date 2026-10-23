# 163 — Claim-verify token burns on GET (prefetchers consume it)

Status: done

Source: security audit (issue 136), 2026-10-15. Rank 3/16 — any GET (email prefetch, chat unfurl) triggers the single-use merge.

## Done

- **Fixed 2026-10-22 (local, uncommitted, Option A):** `(calendar)/claim/verify/[token]/+server.ts` split — `GET` (`:44`) only renders the confirm page (no peek-and-burn), and the POST (`:51`) performs the token burn + guest merge. Email prefetchers and chat unfurls can no longer consume the single-use claim token.
- Gates: **6/6** in `claim/verify/[token]/server.test.ts`.

- `src/routes/(calendar)/claim/verify/[token]/+server.ts:25-43` — token burn + guest merge + email attach all happen on GET. Peek-before-consume helps preview but the mutation still fires.
- Prefetchers/link scanners consume the single-use token and trigger the merge before the user clicks.

## Needs doing

- None (fixed via Option A; confirm-page step accepted).
