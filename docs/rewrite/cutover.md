# Cutover package: `rewrite/v2` (APP-07)

Prepared by the rewrite orchestrator, 2026-11-21 to 2026-11-24. Owner directive 2026-11-21, "push to `test` when done": once the final gate is green the orchestrator pushes `rewrite/v2` to `test` as a fast-forward. `main` is untouched. The test → main promotion stays the owner's call.

## Definition of done ([plan.md](plan.md#definition-of-done))

| # | item | state |
|---|---|---|
| 1 | `npm run census` 0 legacy files; legacy folders gone | met — 0 legacy source files, 0 unported routes, 0 e2e files on legacy code; `src/lib/server`, `components`, `utils`, `stores`, `data`, `admin`, `marketing`, `conformance` deleted (APP-05) |
| 2 | every route wiring-only (R8); `arch` + `docs:check` clean | met |
| 3 | `gate:push` passes; legacy vitest projects deleted; Playwright passes on a local build | met — the final gate on `19fa2528` ran a superset of `gate:push` (`arch`, `docs:check`, typecheck 0 errors, all 21 module suites instead of only the affected ones, a production build) plus Playwright, 88 passed and 2 skipped on a local production build; legacy vitest projects deleted (APP-05) |
| 4 | every README Invariant pinned by a v2 test | met (APP-06 docs pass) |
| 5 | `/api` goldens unchanged since green on legacy | met — S2 sha `66a11131`; the only golden edits are owner-answered rows, each named `Q-NNN` in its test title |
| 6 | READMEs pass D1/D2; every carryover item fixed, ticketed or waived | 60 items in [carryover.md](carryover.md): **5 fixed** (#182, #323, #180, #197, #113); **5 fixed in the port with a residual ticket** (#029, #086, #082, #083, #098); **35 left open outside the rewrite by policy**: 34 are ticketed (the ticket files are in `docs/archive/issues/`) and the 35th, the kernel `MentionInput` ARIA parity item, still needs its accessibility ticket filed; **15 owner decisions pending** (#170, #178, #183, #193, #190, #321, #176, #208, #040, #130, #142, #143, #177, #198, #199); **0 waived; 0 not fixed**. |
| 7 | owner signs off the cutover checklist | **pending (you)** |

## Verification on `19fa2528`

The final gate ran on one commit, `19fa2528` (`rewrite/final`), on one day, 2026-11-24:

- **Pages** (20:59–21:45): one production build (`npm run pages:build`, `NODE_ENV=production`). `visual:check` passed for all 14 catalog modules, desktop and mobile, against legacy baselines recaptured that day from a production build of `41728e65`. `perf:check` passed for all 14 modules under [ADR 0010](../adr/0010-performance-budget.md), with the §6 exception for `calendar-month` and `share-target`; see [Performance](#performance).
- **Modules** (21:46–22:00): `arch` OK, `docs:check` OK, all 21 module suites green (7,695 tests, 0 failures), typecheck 0 errors.
- **Playwright** (22:01–22:04): fresh `familycalendar_e2e` database, `NODE_ENV=production npm run build`, `vite preview` with migrations on; `npx playwright test`: 88 passed, 2 skipped, 0 failed; 9 emails answered by the local Resend stub.

Pushed: `rewrite/v2` = `a130898f` (a merge whose tree is `19fa2528`'s, unchanged), fast-forwarded onto `test` on 2026-11-24 at 22:06.

## What users and the Android app will notice

Only owner-answered changes. Each landed after the module's wire was proven equal to legacy, as a `fix(<module>): Q-NNN` commit with the golden rows changed first (a few modules landed all their answers in one commit). By module:

- tasks and dayDashboard: Q-005a, Q-051, Q-052, Q-053, Q-054, Q-055, Q-056, Q-058, Q-059, Q-060, Q-061
- calendar: Q-043, Q-045, Q-047, Q-048, Q-049
- calendarPage: Q-097, Q-098, Q-099, Q-101
- parsing: Q-008, Q-009, Q-010, Q-012
- groceries: Q-038, Q-039, Q-111
- family and familyHub: Q-023, Q-024, Q-028, Q-115, Q-086, Q-091
- identity and access: Q-015, Q-062, Q-064, Q-065, Q-066, Q-102, Q-103, Q-104, Q-105, Q-107, Q-108, Q-109, Q-110, Q-116, Q-117
- billing and marketing: Q-017, Q-018, Q-068, Q-069, Q-070
- alerts: Q-020, Q-021
- sponsored: Q-040, Q-041, Q-042
- feedback: Q-006
- verse and parked modules: Q-031, Q-032 (verse removed), Q-002 (`/api/meals` removed)
- account: Q-080

Highlights:

- Private Tasks no longer reach the whole family's dashboard (Q-005a).
- Verse removed everywhere; `showDailyVerse` kept on the wire for Android (Q-031/Q-032). Waitlist web page removed (Q-070). `/api/meals` removed (Q-002).
- Email codes are stored as HMAC digests peppered with `EMAILSECRET` (Q-116/Q-117); malformed JSON answers `400 {"error":"Invalid JSON"}` where some routes answered 500 (plan decision).
- Every page loads no more JavaScript than legacy did (see [Performance](#performance)).

## Deviations from legacy (deliberate)

Beyond the owner-answered Qs above:

- `/` server-renders on every adapter.
- Quick-add honours the user's `autoParse` and `useCloudAI` settings.
- A refused email-change send keeps the pending row (legacy parity).
- The user-page data whitelist (#324): the marketing layout serialises only the public user fields. Legacy hotfix `be915320`, ported into v2 as `5fc6156e`.
- [ADR 0010](../adr/0010-performance-budget.md) §6 exception: `calendar-month` and `share-target` may exceed "mobile repeat ready ≤ 1000 ms" at legacy parity (owner 2026-11-22, follow-up [#325](../issues/325-calendar-share-target-under-1s-mobile-repeat.md); encoded in `HARD_LIMIT_EXCEPTIONS` in `e2e/pages/perf-report.ts`).

## Performance

Every catalog page's initial JavaScript is at or under its legacy ceiling ([ADR 0010](../adr/0010-performance-budget.md), baselines in [perf-baseline.md](perf-baseline.md)), measured by the final gate on a production build (`npm run perf:check`, medians of 5 runs, 2026-11-24, gate commit `19fa2528`). Initial JS is gzip bytes transferred before the `load` event; on the desktop profile `load` fires before most route chunks land, so the mobile figure is the page's real initial JS. The ceiling is legacy's recorded figure; the check allows +2%.

| page | initial JS desktop / mobile (KB) | ceiling (KB) | desktop ready first / repeat (ms) | mobile ready repeat (ms) |
|---|---|---|---|---|
| access/claim | 47 / 49 | 56 | 144 / 71 | 229 |
| access/forgot-password | 76 / 76 | 102 | 475 / 138 | 536 |
| access/invite-email | 70 / 70 | 100 | 456 / 128 | 549 |
| access/login | 79 / 79 | 106 | 446 / 130 | 497 |
| access/merge-guest | 47 / 54 | 59 | 152 / 64 | 186 |
| access/reset-password | 76 / 76 | 102 | 479 / 133 | 488 |
| access/signup | 81 / 81 | 105 | 474 / 132 | 568 |
| access/verify-email | 42 / 79 | 104 | 128 / 84 | 263 |
| account/account-settings | 54 / 85 | 117 | 161 / 75 | 328 |
| admin/admin-bugs | 47 / 65 | 67 (see below) | 155 / 63 | 237 |
| admin/admin-home | 54 / 60 | 62 | 204 / 68 | 239 |
| admin/admin-nlp | 53 / 67 | 67 (see below) | 177 / 61 | 237 |
| alerts/notifications | 54 / 89 | 111 | 172 / 73 | 301 |
| billing/checkout | 79 / 80 | 101 | 420 / 125 | 515 |
| billing/pricing | 71 / 71 | 101 | 417 / 123 | 418 |
| calendar/event-detail | 42 / 108 | 112 | 128 / 62 | 234 |
| calendar/import | 46 / 112 | 117 | 157 / 62 | 276 |
| calendar/print | 45 / 106 | 109 | 205 / 77 | 326 |
| calendarPage/calendar-month | 138 / 138 | 197 | 659 / 152 | 869 |
| calendarPage/share-target | 172 / 172 | 197 | 758 / 289 | 1380 (legacy 1728, §6 exception) |
| dayDashboard/dashboard | 113 / 113 | 179 | 561 / 157 | 595 |
| family/families | 46 / 93 | 114 | 141 / 58 | 266 |
| family/family-create | 41 / 92 | 110 | 147 / 74 | 260 |
| family/family-invitations | 46 / 94 | 111 | 151 / 59 | 269 |
| family/family-join | 74 / 74 | 100 | 427 / 121 | 514 |
| family/family-members-add | 41 / 91 | 109 | 136 / 70 | 280 |
| familyHub/family-hub | 47 / 100 | 119 | 156 / 80 | 284 |
| familyHub/family-tasks | 45 / 101 | 122 | 161 / 94 | 284 |
| feedback/report-bug | 41 / 58 | 61 | 132 / 59 | 220 |
| groceries/groceries | 46 / 97 | 118 | 169 / 77 | 353 |
| marketing/about | 71 / 71 | 100 | 417 / 119 | 478 |
| marketing/android | 70 / 70 | 100 | 473 / 134 | 431 |
| marketing/changelog | 54 / 71 | 101 | 188 / 65 | 265 |
| marketing/contact | 74 / 74 | 103 | 426 / 119 | 439 |
| marketing/features | 75 / 75 | 105 | 459 / 131 | 525 |
| marketing/home | 62 / 73 | 102 | 166 / 66 | 343 |
| marketing/privacy | 71 / 71 | 100 | 453 / 131 | 451 |
| marketing/roadmap | 54 / 71 | 100 | 201 / 66 | 264 |
| tasks/archive | 42 / 110 | 111 | 141 / 68 | 282 |
| tasks/stats | 41 / 109 | 111 | 134 / 63 | 253 |
| tasks/tasks | 45 / 142 | 145 | 179 / 94 | 300 |

Harness gap: the two admin register pages moved from the `feedback` to the `admin` catalog module, but their legacy ceilings were still recorded under `feedback/admin-bugs` (66.7 KB) and `feedback/admin-nlp` (67.1 KB), so `perf:check` enforced no JS limit on them at the gate. Measured against those legacy figures they are within the +2% tolerance (65 and 67 KB). The follow-up branch re-keys the two entries (`8b8cb6c3`) so the check enforces them again.

Harness finding, 2026-11-22: local builds inherited `NODE_ENV=development` from the shell, so Vite produced DEV bundles (+4 to 10 KB per page) and the checks failed against ceilings recorded on a production build. `scripts/arch/build-safe.mjs` now pins `NODE_ENV=production`.

## Deployment notes

- **Environment:** v2 reads exactly the same variables as legacy (`ADAPTER`, `BETTER_AUTH_SECRET`, `CEREBRAS_API_KEY`, `CEREBRAS_API_URL`, `CEREBRAS_MODEL`, `CRON_SECRET`, `DATABASE_DISABLE_MIGRATIONS`, `DATABASE_URL`, `EMAILSECRET`, `FCM_SERVICE_ACCOUNT_JSON`, `NODE_ENV`, `NOREPLYEMAIL`, `RESEND_API_KEY`, `TZ`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`). Nothing to add in Vercel.
- **Schema:** no DDL. `sql/migrations` holds the same 27 files as at the rewrite's start.
- **Data:** no backfill. `npm run db:seed` works again on v2 (dev/e2e only: tiers, discounts, demo ads; idempotent).
- **Dependencies:** `@vercel/blob` and its unused subtree removed (#180).

## Owner checklist (in order)

1. **Preview:** `rewrite/v2` previews on Vercel still fail at resource provisioning ([Q-004](questions.md), default C). After the push, review on `test.familyplanz.com` (the `test` branch deploys there); answer Q-004 (A or B) only if you also want per-branch previews.
2. **Hotfix:** `hotfix/user-page-data` (`be915320`) is already ported into v2 as `5fc6156e`. There is no separate push.
3. **Decisions still open** (none blocks the cutover; each default is already applied):
   1. Vercel previews of `rewrite/v2` fail ([Q-004](questions.md)); default C (no preview; review on `test`).
   2. `/api/family/member-search` is open to anonymous accounts (legacy parity; masked emails, 10 rows, 20 per 5 min per IP); default: keep parity.
   3. Rate limits are an in-memory limiter per serverless instance (legacy parity), including the email-code and API-token endpoints; default: keep for cutover, shared store later.
   4. `EMAILSECRET` keys both the email-code HMAC (Q-117) and family invite links; default: one fail-closed config member `emailSecret` for both.
   5. Q-017 B (40% family discount): a person in several families counts the fullest family's members; default applied.
   6. `POST /api/report-phrase` with a malformed body answers `Invalid JSON` (legacy: the phrase copy); default: restore the legacy copy through kernel `malformedBody` (K-20).
   7. Tasks stats month start follows the process zone (UTC in production), as legacy; default: UTC month start, not the caller's stored zone.
   8. Parsing Q-008/Q-009/Q-010 change the web NLP only; the Android parser (`apps/android`, lockstep vectors) needs the same three changes; default: web only, Android follow-up is yours.
   9. Marketing pages `/` and `/features` keep the legacy Pexels image URLs and alts; default: parity until you supply local family imagery (man, woman, children).
   10. Answered B in [questions.md](questions.md) but found still at legacy behaviour at the gate commit: Q-079 (export card copy), Q-081 ("Plan & usage" heading), Q-082 (default-calendar picker names), Q-092 (recurring-cursor pin inside the board read), Q-093 (`glance.openToday` lower bound), Q-094 (family event colour), Q-106 (date-only `recurrenceUntil` keeps its day). They land right after this push as follow-up `fix(<module>): Q-NNN` commits, verified on their own (module suites, Playwright, pages visual/perf; the account and Day Dashboard baselines become our render where the answer changes them). Q-092's sweep rides the only existing cron, `/api/cron/cleanup`, which runs **weekly** (`0 4 * * 1`), so an untouched recurring Task's due date can lag up to a week; default: keep `vercel.json` as is, say if you want a daily schedule.
   11. Four `// SAFETY:` input boundaries recorded for #182, each kept because a schema would change a pinned wire: calendar `DELETE`'s tolerant body (`src/lib/domains/calendar/calendar.events.http.server.ts:133`), the rsvp clone dispatch (same file, `:183`), feedback's `/report-bug` echo body (`src/lib/domains/feedback/feedback.http.server.ts:232`) and marketing's form-encoded contact (`src/lib/domains/marketing/marketing.http.server.ts:56`); default: keep.
4. **Promote:** after the review on `test.familyplanz.com`, promote test → main under the usual gate ([archived #143](../archive/issues/143-the-promotion-gate.md)).
5. **After cutover:** archive `docs/rewrite/` into `docs/archive/rewrite-v2/`; module READMEs and `docs/architecture/` stay as the permanent docs.
6. **Housekeeping:** delete the stray untracked `falso_tmp.mjs` (385 KB jsDelivr bundle, 2026-11-12) in the main checkout. The orchestrator removes the integration worktrees after cutover (script).
