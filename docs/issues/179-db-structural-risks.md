# 179 — DB structural risks: pooling, blocking DDL, unprofiled indexes, tz/i18n
Status: open
Source: production-readiness database audit, 2026-10-16.
## Done
- `db/index.ts:6-7` — bare `postgres(DATABASE_URL)`, no `max`/pooled-host pinning in code; pooling depends on which URL is deployed (pooled/unpooled vars both exist, `.env.example:3-19`). `rateLimit.ts:1-4` already documents the single-instance stance.
- Every migration runs one-project-in-a-tx including the `014` index build (`runner.ts:75-86`); `CREATE INDEX CONCURRENTLY` appears nowhere.
- No EXPLAIN/profiling artifacts at any volume; indexes exist ad hoc (`014`, `receipt_items_bill_idx` schema.ts:649, `bug_reports_status_created_idx` :910); no FK/sort-column coverage audit.
- Mixed tz declarations: some `createdAt` plain `timestamp` (schema.ts:298,372) vs timestamptz elsewhere (763-764); storage UTC-by-default, conversion at presentation.
- i18n: PG `text` + `\p{L}\p{N}` normalization (tagTable.ts:27-35) should survive emoji/RTL/apostrophes, but zero round-trip DB tests (all mocked per #002). [INFERENCE] from stack defaults.
- Scale context (N-A, not failure): 239 users, empty feature tables — 5M-class profiling unmeasurable today; structural risks for later, not on fire now.
## Needs doing
- Pin pooled URL + `max` in code; CONCURRENTLY for future index builds; FK/sort index audit; normalize tz declarations; one emoji/RTL round-trip test through a real DB.
