# 180 — Blob store is public, unmetered, unsniffed — live but unwired
Status: open
Source: production-readiness security audit, 2026-10-16.
## Done
- `src/lib/server/services/blobService.ts:22-25` — `put(..., { access: 'public' })` (spec wants private/isolated); `size: 0` hardcoded (`:34,62`, no size metering); `contentType` trusted from caller with no MIME sniffing (`:23`); no virus scan, no limit.
- `uploadAdImage` has zero route callers — not wired into any route today, but live attack-ready code sitting in the estate.
## Needs doing
- Option A — harden before first wiring (private bucket, size cap, MIME sniff, async scan). Cost: storage-slice work before the feature.
- Option B — delete until needed (dead attack-ready code has no reason to ship). Cost: re-write on demand.
- Decide before any route wires it; not choosing in this ticket.
