# 144 - Drop the unused userAdConsent table

Status: done

**What to build:** Nothing for a user to see. The consent position is already
correctly served by the replacement table that carries real rows; this removes the
one that carries none, so the schema stops describing two ways of answering the
same question when only one of them is live.

**Owner decision, 2026-10-04:** drop it. Explicitly instructed.

**Blocked by:** None (can start immediately).

**Status:** open

- [x] Row count confirmed zero **before** the drop, on every branch, and recorded:
      `main` 0 rows (239 users), `preview/test` 0 rows (103 users)
- [x] SQL recorded in `sql/migrations/016-drop-user-ad-consent.sql` with the decision,
      the date, and the per-branch counts
- [x] Applied to **both** branches — `br-holy-salad-a50xupa6`, `br-misty-butterfly-a5mpnuxu`
- [x] Absence confirmed after via `to_regclass('"userAdConsent"') IS NULL` → `true`
      on both. Not inferred from the DROP succeeding
- [x] Whole-repository search found no code reference — only an archived plan, a
      historical migration, and comments saying it had no writer
- [x] `adConsentRecords` still present on both branches (`live_table_present = true`),
      so the live consent path is untouched
- [x] Written as a numbered migration so a fresh environment cannot resurrect the
      table via migration 003, matching the existing `015-drop-*` convention
- [x] Build and full suite green afterwards


**Re-verified live 2026-10-15 (owner's "run it with neon mcp" instruction): no-op — already applied.** Probed the app branch directly (`ep-plain-cloud-a5hugp4l.us-east-2`, 239 users = `main`): `adConsentRecords` present with pkey + `userId_recordedAt` index, 0 rows; `to_regclass('"userAdConsent"') IS NULL`; `grocery_store_colours` present. The 2026-10-04 record above stands. Neon MCP server confirmed already installed (global opencode config); CLI 7.0.6 oauth could not see project `hidden-resonance-16080139` (different account scope), so verification ran over the repo's own `DATABASE_URL_UNPOOLED`.
**Note:** this is irreversible, which is why the row count is confirmed and recorded
first and the absence is verified after. The owner's instruction to drop it is the
authority for the irreversibility; the verification is what makes it safe.

