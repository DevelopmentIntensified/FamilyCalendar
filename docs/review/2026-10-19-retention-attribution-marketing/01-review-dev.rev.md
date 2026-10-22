# Review — 2026-10-19 batch (f1c2fed, 3212ea3, c4b7dca)

Reviewer: dev.rev@familyplanz (review pod). Range: `e13e59c..c4b7dca` on `test`, three slices.

## Verdict

**MERGE-READY.** 0 MUST-FIX, 0 HIGH, 1 MEDIUM, 1 LOW, 3 INFO. All three slices do what their
issues say; nothing over-claims; issue bookkeeping is honest (029 stays `in-progress`, 087 stays
`open` for the residue). The one MEDIUM is about the handoff report's wording, not the code.

## Builder claims — re-verified independently

| Claim | Result |
|---|---|
| Full suite 257 files / 3658 green | ✓ vitest unit: 257/257 files, 3658/3658 passed (my run, 112s). But "full suite" is unit-only — see MEDIUM-1. |
| check 0 errors | ✓ svelte-check: 0 errors, 42 warnings (pre-existing scale) |
| build green | ✓ `npm run build` exit 0 |
| `npm test` (the repo script = unit **and** e2e) | ✗ e2e half fails at module load — pre-existing, see MEDIUM-1/MEDIUM-2 |

## Slice 1 — f1c2fed #092 stats attribution: PASS

- Defect confirmed in the parent commit: all four viewer-facing figures filtered
  `eq(taskCompletions.userId, userId)` (owner-only) at taskStats.ts:50/66/106/120 pre-fix.
- Fix applies the two-leg predicate (`actorId` when present, owner fallback for legacy rows) to
  exactly those four figures; `doneBy` stays owner-scoped on purpose (names who did the work on
  the viewer's tasks) — pinned by comment + a dedicated test.
- Anti-slop: the predicate now lives in ONE home (`completionAttribution.ts`); dashboard.ts
  imports it instead of keeping its hand-copy. This fix *deleted* a duplicate rather than adding
  one. `export.ts` owner-OR-actor read is correct for export semantics (verified at :95);
  cursor/mutations are write paths. Grep sweep re-run by reviewer: no other owner-only
  completion read exists.
- Tests: QueryBuilder-rendered SQL asserts both legs, with the legacy fallback on its own test —
  the ticket's untestable-fallback concern is answered. 15/15 targeted green.
- INFO-1: `taskCompletions.actorId` is `onDelete: 'set null'` (schema.ts:781). Deleting an actor
  re-attributes their completions to the task owner via the fallback leg. Pre-existing schema
  behavior, now consistent in both readers (dashboard + stats). Acceptable; noting so a future
  reader doesn't mistake it for a bug.

## Slice 2 — 3212ea3 #029 retention prunes: PASS

- Predicates verified against the schema's column modes, which they match exactly:
  `notifications.readAt` is `mode: 'string'` (schema.ts:807) → ISO-string cutoff param;
  `unmatchedPhrases.updatedAt` (:957) and `bugReports.resolvedAt/createdAt` (:985-986) are
  `mode: 'date'` → Date cutoff params.
- Safety shape is right: unread notifications / open phrases / open reports can never match —
  each "never" leg is pinned by its own test rendering real SQL (`"readAt" is not null`,
  `"resolved" = $1`, `"status" <> $1`). `status` is notNull so `ne(status,'open')` is NULL-safe.
  `coalesce(resolvedAt, createdAt)` correctly handles closed-without-timestamp rows.
- Cron route: `CRON_SECRET` check untouched and still first; the three prunes are independent
  (`Promise.all`, no cross-gating); counts reported in the envelope as claimed.
- Windows match the owner's 2026-10-15 ruling (90d read notifications, 180d resolved).
- Issue bookkeeping honest: #029 stays `in-progress`; `adEvents` window + URL-query redaction
  remain correctly listed as owed.
- LOW-1: the `cutoffIso: string` vs `cutoff: Date` param-type asymmetry across the three new
  prune functions is schema-forced but unexplained at the signature. One line on
  `pruneReadNotificationsOlderThan` ("readAt is mode:'string', hence ISO string not Date") stops
  a future editor from "normalizing" the types and breaking the bind. Non-blocking.
- INFO-2: `notifications.test.ts` lost its trailing newline in this commit. Trivial.
- INFO-3: failure shape of `runCleanup` is unchanged — any prune throwing 500s the whole request
  and the cron retries next week (same as the pre-existing claim-token delete). Acceptable for a
  weekly idempotent sweep.

## Slice 3 — c4b7dca #087 marketing truth pass: PASS

- Changelog: the three Bills entries removed. Roadmap: Shipped now lists only live features;
  money items and the spend report are gone; Coming next carries one honest item (calendar-sync
  research). Privacy policy: the Resend receipt-ingest processor row removed; the
  receipt-scanning/PDF footnote removed; Neon reworded; "Last updated" bumped; the Resend row
  for magic links/resets correctly KEPT (that flow is live), and the Vercel ad-image disclosure
  correctly KEPT (ads are live).
- Reviewer re-ran the marketing sweep (`bill|receipt|spend|burn|ingest` over marketing routes +
  data + seo): only pricing "billing period" text and comments citing #087 remain. Clean.
- Residue (tables' fate blocked by #086; caller-less `parseBillQuickAdd`) correctly stays in
  Needs doing; issue correctly stays `Status: open`.

## MEDIUM-1 — the handoff said "Full suite … green"; the repo's `npm test` is red

`npm test` = vitest **and** `playwright test` (package.json:25). The e2e half fails at test-file
load: 7 e2e files still `import { lucia } from '$lib/server/auth'`
(`e2e/testUtils.ts:4`, `e2e/account/AccountDeletion.test.ts:19`, `e2e/account/AccountSettings.test.ts:10`,
`e2e/account/EmailChange.test.ts:9`, `e2e/calendar/SettingsPage.test.ts:9`,
`e2e/family/FamilyCreation.test.ts:19`, `e2e/navigation/Navigation.test.ts:9`) — an export the
#196 better-auth cutover removed. The SyntaxErrors reproduce in `npm test` output (observed on
HEAD). The unit numbers in the handoff are exact and verified; the label "full suite" overstates
the green set. The breakage PREDATES this batch (present at parent e13e59c, which introduced it)
and is owned by #196 step 7 ("rerun the full auth e2e + unit gates") — no code change is asked of
these three slices. What is asked: the handoff record should say unit-suite green + e2e red, and
the e2e port must be a named open item on #196 before anyone trusts `npm test` again.

## What was NOT reopened

- The 41 test files that each define their own `vi.mock('$lib/server/db')` — established repo
  convention (see #116); the new tests follow it consistently. Not a finding against this batch.
- `runCleanup` sequential-vs-parallel semantics, retention window values, `doneBy` scoping.

## Verification log (reviewer-run)

- `npx vitest run` on the 4 new/extended files: 15/15 green.
- Parent-commit predicate check: `git show f1c2fed^:...taskStats.ts` — owner-only filters at the
  four figures; `attributedToViewer` already private in dashboard.ts (the one home claim).
- Full unit suite: 257 files / 3658 tests passed (exit 0).
- `npm run check`: 0 errors / 42 warnings. `npm run build`: exit 0.
- Marketing sweep grep re-run; completion-read grep re-run.
