# 04 — Program (gate, audits, findings, rulings, reds)

## Gate (#130 → #143, strict confirmed 2026-10-15)

Nothing to `master` until the owner approves screenshots of every page and every finding is closed/waived. Five phases: audit → owner's marks → missing pages → implement (one lane one folder) → gate. 60 user stories in #130. Checklist #143: pass/fail only, build+suite non-falling, check non-increasing, e2e with DB, proto+brand green, per-route approve/waive, findings closed/waived, no owner-blockers.

## Audits done

- #131 harness DONE (token-only ruling; geometry manual). #135 UI DONE → #170 two-orange fork, #171 tracking/gray/radius, #172 touch targets, #173 focus rings. #136 security DONE → #162 plaintext codes, #163 claim-GET, #164 event-task leak, #165 shared-edit leg, #166 email-change gaps, #167 defaultCalendar, #168 mass-assignment, #169 token/session hygiene.
- Deduped: rank 1 → #152 live; rate key → #150; missing limits → #147–149/#151/#089; advisories → #156–161 (none new: svelte 5.20.1 OOR, vite/esbuild dev-only, drizzle/capacitor/transitives tracked).

## Open clusters

Security 147(A verify-first ruled)/148/149/150/151/152/153/154/155 + advisories 156–161 · Parity pilot 137 (blocked 131+135) then 138–141 · Port lanes 122 (blocked on prototype edits) → 123–128 · Calendar 119 (app done, E review traffic) / 120 (second-row fold, needs browser) / 104 (superseded mobile part) · Tech-debt 086 (baseline) / 087 (archived advertised) / 089 / 090 (blocked 086) / 091 · Perf 041–044 · Events 014 (3 open) · UX 015 (4 items) · Privacy 029 (M5 ruled) · 023 (needs Vercel logs) · 040 (needs clean repro) · Deepening 110–117 (110 biggest) · Groceries 074 active / 081 module slot.

## Owner rulings 2026-10-15 (all 11)

1. #131 Option A token-only · 2. kill `d-working-calendar.html`, E sole ref · 3. drop `userAdConsent` (ran 2026-10-04, re-verified live no-op) · 4. #088b DDL already live (probe: consent table + index present, 0 rows) · 5. #147 Option A verify-first + resend path · 6. strict gate, no bypass · 7. owner will mark up pages on test · 8. #040 clean repro owed · 9. #023 Vercel logs owed · 10. #014 ADR then fix + mirror propagates · 11. retention 180d resolved phrases/bugs + 90d read notifications (`runCleanup()` sweep; adEvents undecided; URL redaction owed).

## Known reds (pre-existing, not regressions)

- `EventRecurrenceCard.svelte.test.ts`: pinned "35 occurrences since Feb 2026" renders 37 — date drift, fails on pristine tree.
- `svelte-check`: ~39–49 errors float with lanes, none on touched lines; treat as floor.
- `proto:check` 5 green · 0 red · 3 skipped (collector-dependent). Unit 3545/3546 (above red excepted).
