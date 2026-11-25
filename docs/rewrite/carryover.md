# Carry-over: open tickets the rewrite must honour

Every web/server ticket that was not `done` when the tickets were archived (2026-11-11), grouped by the module whose port touches it. Android tickets stay active in [docs/issues/](../issues/README.md). Done and dead tickets are only in [docs/archive/issues/](../archive/issues/).

**Policy** column (the module rebuild is a rewrite, see [port-a-module.md](playbooks/port-a-module.md#what-is-fixed-and-what-is-open)):

- **keep behaviour**: the fix would change an external contract (the `/api` wire, the schema, a CONTEXT.md rule, or auth/security behaviour clients feel), so it stays a ticket. Rebuild without it. If the fix turns out to be purely internal, fix it during the rebuild: failing test first, ticket named in the commit.
- **FIX-IN-PORT**: the new design fixes it. The rebuild step that does so names the ticket in its commit.
- **owner**: needs an owner decision. Don't act on it during the rebuild.
- **keep markup**: design polish. The rebuilt UI must keep the approved look (the K-10 visual check) and not regress the polish already shipped. Implementing the ticket itself is separate.

Read your module's section in S1.

**Status at cutover** (audited 2026-11-21 against the integrated tip, the gate for [plan](plan.md) DoD item 6): `fixed` = the in-port work landed and the cell names the code and the test pinning it; `open: ticket #NNN` = the fix stays outside the rewrite and the ticket file is still under [docs/archive/issues/](../archive/issues/); `owner decision pending` = an owner call, no rebuild action; `NOT fixed` = the audit could not find the work, and the cell says what is missing.

## kernel

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#029](../archive/issues/029-privacy-audit.md) | SECURITY | PII (emails, ids) in server logs; adEvents retention ruling; unmatched-phrase URL redaction. | FIX-IN-PORT for new code (kernel log rule: never log emails/bodies); retention + redaction stay tickets | fixed for new code (rule at `src/lib/kernel/log/jsonLog.ts:6` and `src/lib/kernel/README.md:192`; every `ctx.log` call site passes ids/messages only, e.g. `src/lib/domains/access/access.claim.service.server.ts:121`; line shape pinned by `src/lib/kernel/log/jsonLog.test.ts:5`) + open: ticket #029 (adEvents retention ruling, unmatched-phrase URL redaction) |
| [#122](../archive/issues/122-port-approved-prototype-changes.md) | DESIGN | Verify every approved prototype mark shipped, one pinning test per mark. | keep markup | open: ticket #122 |
| [#137](../archive/issues/137-parity-worst-route-first.md) | DESIGN | Parity harness loop on the worst route. | keep markup | open: ticket #137 |
| [#170](../archive/issues/170-two-orange-fork.md) | OWNER | Terracotta vs primary orange. | owner | owner decision pending |
| [#171](../archive/issues/171-tracking-gray-drift.md) | DESIGN | Tracking/gray/radius drift. | keep markup | open: ticket #171 |
| [#172](../archive/issues/172-touch-targets-below-44px.md) | DESIGN | Touch targets below 44px. | keep markup; kernel/ui components keep legacy sizes | open: ticket #172 (kernel/ui keeps the legacy sizes, so no new violation ships) |
| [#173](../archive/issues/173-focus-rings-missing.md) | DESIGN | Missing focus-visible rings. | keep markup | open: ticket #173 |
| [#178](../archive/issues/178-no-soft-deletes.md) | SCHEMA | Soft deletes or a recorded waiver. | owner | owner decision pending |
| [#179](../archive/issues/179-db-structural-risks.md) | SCHEMA | Pooled URL + max connections, CONCURRENTLY, timezone normalization, RTL/emoji round-trip. | keep; kernel connectDb keeps max 10 like the legacy pool | open: ticket #179 (max 10 preserved: `src/lib/kernel/db/database.server.ts:28`) |
| [#182](../archive/issues/182-no-schema-validation.md) | SECURITY | Schema validation at every boundary. | FIX-IN-PORT: zod schemas on every endpoint/action as each module ports; close when census is 0 | fixed — the 33 schema-less input boundaries now declare a `query`/`params`/`body`/`form` schema in the module contract (`CalendarEventRangeQuery`, `CalendarEventParams`, `CalendarPrintQuery`, `CalendarLocationQuery`, `CalendarBulkBody`, `TaskListQuery`, `FocusSessionsQuery`, `TaskRouteParams`, `AccessEmailLinkQuery`, `AccessClaimParams`, `ClaimRequestForm`, `ChangeEmailForm`, `VerifyEmailForm`, `Account*Form` ×7, `CheckoutPurchaseForm`), pinned by each module's `*.contract.test.ts`; four recorded `// SAFETY:` reads remain because a schema would change a pinned wire: calendar `DELETE`'s tolerant body (golden pins `200` for junk), the rsvp clone dispatch (legacy throws), feedback's `/report-bug` echo body (parsed with `BugReportFormBody` inside the handler) and marketing's form-encoded contact (parsed with `ContactApiBody` in the service, after the budget) |
| [#183](../archive/issues/183-no-observability.md) | OWNER | Sentry + uptime monitor. | owner; kernel Log is the seam | owner decision pending (kernel Log is the seam) |
| [#192](../archive/issues/192-muted-text-contrast.md) | DESIGN | Muted text contrast ≥ 4.5:1, 12px floor. | keep markup | open: ticket #192 |
| [#193](../archive/issues/193-emoji-as-ui.md) | OWNER | Emoji as meaning-bearing UI. | owner | owner decision pending |
| [#322](../archive/issues/322-desktop-theme-prototype.md) | DESIGN | Desktop theme prototype variants. | prototype branch only | open: ticket #322 (prototype branch only) |
| — (kernel/ui `MentionInput`, no ticket) | A11Y | The mention picker keeps the legacy ARIA for parity: `role="combobox"` on a `<textarea>`, and the `<p>` header and footer rows sitting inside `role="listbox"` where only `role="option"` children are valid. Ported as-is by K-08b; fixing it is an accessibility ticket of its own (a real combobox pattern is not a textarea). | keep markup (legacy parity; `components/MentionInput.svelte` is the reference) | open: no ticket (`src/lib/kernel/ui/MentionInput.svelte` keeps the legacy ARIA verbatim; an a11y ticket is still to be filed) |

## identity

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#169](../archive/issues/169-token-session-hygiene.md) | SECURITY | API token expiry + scopes, session idle timeout, PII log scrub. | keep behaviour; separate ticket (changes the Android contract) | open: ticket #169 |
| [#174](../archive/issues/174-email-normalization-duplicates.md) | SECURITY+SCHEMA | Email normalization (case/+alias) at write and lookup; dedupe backfill. | keep behaviour; separate ticket (data backfill needs owner) | open: ticket #174 |

## alerts

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#186](../archive/issues/186-no-queues.md) | STRUCTURE | Retries/backoff/DLQ for email and push. | keep; separate ticket (ports make it a one-adapter change) | open: ticket #186 (the ports now make it a one-adapter change) |

## family

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#138](../archive/issues/138-parity-family-folder.md) | DESIGN | Family routes parity. | keep markup | open: ticket #138 |
| [#190](../archive/issues/190-children-data-consent.md) | OWNER | Children: age gate + verified parental consent. | owner | owner decision pending |

## parsing

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#112](../archive/issues/112-parser-claims-cannot-overlap.md) | STRUCTURE | Route the whole 55-rule chain through the claim book; re-point the 272-test table. | keep behaviour; separate test-first ticket after the parsing port | open: ticket #112 |
| [#188](../archive/issues/188-ai-safety-gaps.md) | SECURITY | AI prompt logs, injection delimiters, PII filter, eval harness. | keep; separate ticket | open: ticket #188 |
| [#206](../archive/issues/206-bug-report-batch-2026-10-25.md) | BEHAVIOUR | "p.m." tokenization + second "at the y"; 500-class and mobile-nav repros. | keep behaviour; separate test-first NLP ticket | open: ticket #206 |
| [#323](../archive/issues/323-shared-parse-vectors.md) | STRUCTURE | One dateVocab address; parse vectors drive both suites. | FIX-IN-PORT: the parsing module becomes the one address; vectors stay 145 in lockstep | fixed — `src/lib/domains/parsing/parsing.vocabulary.rules.ts:73` is the one token address and the 145 vectors gate drift (`src/lib/domains/parsing/parsing.task.rules.test.ts:71,150`); `calendar.bulkPlan.rules.ts` now imports `MONTH_ALT`, `MONTH_INDEX_1`, `DAY_ALT`, `dayNumber`, `applyPeriod` and `escapeRegExp` from `$lib/domains/parsing`, its local copies and the stale "moves to parsing" comment are gone, and the word lists were byte-identical, so bulk-plan behaviour is unchanged (`calendar.bulkPlan.rules.test.ts` green) |

## groceries

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#074](../archive/issues/074-groceries-approved-layout.md) | DESIGN | 320px no-overflow check needs a real browser. | keep markup; do not regress | open: ticket #074 |
| [#086](../archive/issues/086-migration-baseline-missing.md) | BEHAVIOUR | Verify the #115 store-colour scope-key question; retire stale bills SQL files in sql/ root. | FIX-IN-PORT: golden + repo tests pin personal-vs-family colour keys; SQL file cleanup stays a ticket | fixed (`src/lib/domains/groceries/groceries.repo.server.ts:274,281` names the partial-index predicate on both branches, so the family upsert no longer faults; golden `src/lib/domains/groceries/groceries.http.db.test.ts:1191`, service `src/lib/domains/groceries/groceries.service.db.test.ts:548`) + open: ticket #086 (retire the stale bills SQL files in sql/) |

## sponsored

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#180](../archive/issues/180-blob-store-public-unmetered.md) | SECURITY | Blob store public/unmetered: harden or delete the unwired code. | owner answered [Q-003](questions.md): delete `blobService.ts`, the unwired `adService` helpers and `@vercel/blob` in the sponsored port (S8) | fixed — the code is gone (`blobService.ts`/`adService.ts` absent, no `@vercel/blob` importer anywhere) and the dependency with its now-unused subtree left `package.json` and the lockfile in `ba1fc271` |

## calendar

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#014](../archive/issues/014-events-calendar-med-low.md) | SCHEMA+BEHAVIOUR | Unique index on event_exceptions (+ duplicate sweep), DST ADR, exception edits must propagate to family mirrors (owner ruling 2026-10-15). | keep behaviour; separate ticket after the calendar port (needs DDL approval + ADR) | open: ticket #014 (needs DDL approval + ADR) |
| [#082](../archive/issues/082-calendar-window-fetch.md) | BEHAVIOUR | Import success link to first date; /api/events auth-scope pin test; live verify. | FIX-IN-PORT for the auth-scope pin (golden tests); rest stays a ticket | fixed (`src/lib/domains/calendar/calendar.events.http.db.test.ts:201` reads personal + family calendars and hides a stranger's; the success card links the earliest landed day, `src/lib/domains/calendar/calendar.import.state.test.ts:156`) + open: ticket #082 (live verify on the preview) |
| [#083](../archive/issues/083-import-preview-before-commit.md) | BEHAVIOUR | ICS import preview-screen tests, Playwright upload→commit, success-screen deep link. | FIX-IN-PORT for the tests (goldens + UI tests); deep link stays a ticket | fixed (goldens `src/lib/domains/calendar/calendar.import.http.db.test.ts:143,584,838`; duplicate-aware default, select-all and back-to-suggested in `src/lib/domains/calendar/calendar.import.state.test.ts:108`; screen frame `src/lib/domains/calendar/ui/CalendarImportScreen.svelte.test.ts:17`; the success deep link also landed, `calendar.import.state.test.ts:156`) + open: ticket #083 (Playwright upload → preview → commit) |
| [#106](../archive/issues/106-event-rsvp-summary-line.md) | DESIGN | Collapse the attendee list into a summary line. | keep markup | open: ticket #106 |
| [#141](../archive/issues/141-parity-import-notifications-event.md) | DESIGN | Import/notifications/event parity. | keep markup | open: ticket #141 |
| [#197](../archive/issues/197-svelte-5-57-migration.md) | STRUCTURE | Svelte 5.57: EventFormModal runes pattern (canSubmit never re-evaluates). | FIX-IN-PORT: v2 UI is runes-only with state classes | fixed (runes state class `src/lib/domains/calendar/calendar.eventForm.state.svelte.ts:64`, `canSubmit` re-derives at `:160`, pinned by `src/lib/domains/calendar/calendar.eventForm.state.test.ts:68`; no `createEventDispatcher`/`export let` anywhere under `src/lib/{domains,screens}`) |

## tasks

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#079](../archive/issues/079-tasks-page-spacing.md) | DESIGN | Filter-row, inbox and row-meta spacing polish. | keep markup; do not regress | open: ticket #079 |
| [#113](../archive/issues/113-tasks-ts-six-modules-in-one-file.md) | STRUCTURE | tasks.ts split, shared section select, eventCalendarId on every list query, merge the 7 visibility queries. | FIX-IN-PORT for structure (the tasks port supersedes it); adding eventCalendarId to other lists is additive and stays a ticket | fixed (`src/lib/domains/tasks/` replaces `tasks.ts`; one list read `src/lib/domains/tasks/tasks.items.service.server.ts:225`, sections `:379`, board `:454`; one projection `src/lib/domains/tasks/tasks.repo.server.ts:84` carrying `eventCalendarId` (`:80`) for both list legs; the private read rule is pinned at `tasks.items.service.db.test.ts:204`; the seven selectors stay as thin wrappers over that one projection and section rows keep the legacy shape without `eventCalendarId`) |
| [#320](../archive/issues/320-desktop-task-read-panel.md) | BEHAVIOUR | Desktop task read panel (feature in progress on test). | port what has landed on `test`; the unfinished part is frozen there (Q-001) and waits for the owner | open: ticket #320 (nothing has landed on `test` to port; the unfinished part stays frozen by Q-001) |
| [#321](../archive/issues/321-convert-task-to-jira-linear.md) | OWNER | Convert task to Jira/Linear. | owner | owner decision pending |

## access

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#175](../archive/issues/175-auth-guessing-surface.md) | SECURITY | Reset TTL ≤ 30 min; IP-only login cap + backoff. | keep behaviour; separate ticket | open: ticket #175 |
| [#176](../archive/issues/176-mfa-absent.md) | OWNER | MFA: waive or build. | owner | owner decision pending |

## marketing

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#095](../archive/issues/095-icon-synthesis-reads-as-calendar.md) | DESIGN | og/twitter/canonical tag audit; owner rules on theme_color. | keep behaviour | open: ticket #095 (owner rules on theme_color) |
| [#194](../archive/issues/194-marketing-glass-tiles.md) | DESIGN | Dead theme tokens; owner fork on glass/orbs. | keep markup | open: ticket #194 |

## account

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#129](../archive/issues/129-settings-page-missing-the-prototypes-look.md) | DESIGN | Settings page measurements + four owner calls. | keep markup | open: ticket #129 (four owner calls outstanding) |
| [#140](../archive/issues/140-parity-account-folder.md) | DESIGN | Account folder parity. | keep markup | open: ticket #140 |

## familyHub

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#098](../archive/issues/098-first-family-is-a-guess.md) | BEHAVIOUR | Duplicate family-tasks route crashes; two-family API tests. | keep URLs; add two-family goldens during the family/familyHub ports | fixed (`src/lib/screens/familyHub/familyHub.http.db.test.ts:250` reads the family named by the id, never the oldest; `src/lib/domains/family/family.http.db.test.ts:1600` refuses a non-member who belongs to another family; `src/lib/domains/family/family.pages.http.db.test.ts:95` answers every family; the duplicate `(family)/family/tasks` route now wires `familyBoardPageLoad` and `[familyId]/tasks` is the 308 redirect) + open: ticket #098 (positive add-member / create-child / search-in-the-other-family handler tests) |

## dayDashboard

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#139](../archive/issues/139-parity-tasks-dashboard-groceries.md) | DESIGN | Tasks/dashboard/groceries parity. | keep markup | open: ticket #139 |
| [#208](../archive/issues/208-dashboard-reflow-prototype.md) | OWNER | Dashboard reflow variant review. | owner | owner decision pending |

## calendarPage

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#040](../archive/issues/040-calendar-load-vm-error.md) | OWNER | Console TypeError on calendar load — waiting on the reporter. | owner | owner decision pending (blocked on the reporter) |
| [#119](../archive/issues/119-calendar-mobile-rail-must-not-exist.md) | DESIGN | Measure toolbar/fold at 1280×800; Prototype E review traffic. | keep markup | open: ticket #119 |
| [#120](../archive/issues/120-calendar-toolbar-three-marks.md) | DESIGN | Fold measurement; keyboard parity after DayNav adoption. | keep markup | open: ticket #120 |
| [#201](../archive/issues/201-cant-see-events-next-month.md) | BEHAVIOUR | Live-verify "can see next month's events" after #082. | keep; verify on the preview after the calendarPage port | open: ticket #201 (live verify, shared with #082) |
| [#202](../archive/issues/202-mobile-calendar-tap-targets-and-sandwich-menu.md) | BEHAVIOUR | Overflow-sheet toast ack, 360px Playwright spec, add-modal reassessment. | keep; port must not regress | open: ticket #202 |

## app

| ticket | class | what remains | policy | status at cutover |
|---|---|---|---|---|
| [#016](../archive/issues/016-security-lows.md) | SECURITY | Widen the Origin check beyond /api/*; validate checkout finalPrice server-side. | keep behaviour; separate ticket | open: ticket #016 |
| [#130](../archive/issues/130-the-gate-to-master-audit-marks-and-a-definition-of-done.md) | OWNER | The gate to master: owner screenshot approval per page. | owner (applies to cutover) | owner decision pending (applies to cutover) |
| [#142](../archive/issues/142-security-fixes.md) | SECURITY | Every security finding fixed or waived by the owner, waiver recorded. | owner ledger stays; cutover checks it | owner decision pending (the waiver ledger stays with the owner) |
| [#143](../archive/issues/143-the-promotion-gate.md) | OWNER | Written pass/fail promotion checklist + owner sign-off. | owner (cutover) | owner decision pending (cutover) |
| [#177](../archive/issues/177-no-backups-pitr.md) | OWNER | Neon PITR restore drill. | owner | owner decision pending |
| [#181](../archive/issues/181-no-csp-hsts.md) | SECURITY | CSP (nonced inline scripts) + HSTS. | keep; separate ticket after APP-03 | open: ticket #181 |
| [#185](../archive/issues/185-iac-rollback.md) | STRUCTURE | Env parity, deploy pins commit, rollback script. | keep; separate ticket | open: ticket #185 |
| [#198](../archive/issues/198-calendar-sync-verdict-review.md) | OWNER | Calendar sync verdict. | owner | owner decision pending |
| [#199](../archive/issues/199-group-chat-video-rework.md) | OWNER | Group chat/video plan rework. | owner | owner decision pending |

## Android (not part of the rewrite)

Active in docs/issues: [#210](../issues/210-native-android-app.md), [#280](../issues/280-task-categories-taskfocus.md), [#293](../issues/293-phone-focus-sessions.md), [#294](../issues/294-android-shell-theme.md), [#309](../issues/309-android-event-form-controls.md). The rewrite only owes them an unchanged `/api` contract.
