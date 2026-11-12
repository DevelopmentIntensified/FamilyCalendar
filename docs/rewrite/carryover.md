# Carry-over: open tickets the rewrite must honour

Every web/server ticket that was not `done` when the tickets were archived (2026-11-11), grouped by the module whose port touches it. Android tickets stay active in [docs/issues/](../issues/README.md). Done and dead tickets are only in [docs/archive/issues/](../archive/issues/).

**Policy** column (the module rebuild is a rewrite, see [port-a-module.md](playbooks/port-a-module.md#what-is-fixed-and-what-is-open)):

- **keep behaviour**: the fix would change an external contract (the `/api` wire, the schema, a CONTEXT.md rule, or auth/security behaviour clients feel), so it stays a ticket. Rebuild without it. If the fix turns out to be purely internal, fix it during the rebuild: failing test first, ticket named in the commit.
- **FIX-IN-PORT**: the new design fixes it. The rebuild step that does so names the ticket in its commit.
- **owner**: needs an owner decision. Don't act on it during the rebuild.
- **keep markup**: design polish. The rebuilt UI must keep the approved look (the K-10 visual check) and not regress the polish already shipped. Implementing the ticket itself is separate.

Read your module's section in S1.

## kernel

| ticket | class | what remains | policy |
|---|---|---|---|
| [#029](../archive/issues/029-privacy-audit.md) | SECURITY | PII (emails, ids) in server logs; adEvents retention ruling; unmatched-phrase URL redaction. | FIX-IN-PORT for new code (kernel log rule: never log emails/bodies); retention + redaction stay tickets |
| [#122](../archive/issues/122-port-approved-prototype-changes.md) | DESIGN | Verify every approved prototype mark shipped, one pinning test per mark. | keep markup |
| [#137](../archive/issues/137-parity-worst-route-first.md) | DESIGN | Parity harness loop on the worst route. | keep markup |
| [#170](../archive/issues/170-two-orange-fork.md) | OWNER | Terracotta vs primary orange. | owner |
| [#171](../archive/issues/171-tracking-gray-drift.md) | DESIGN | Tracking/gray/radius drift. | keep markup |
| [#172](../archive/issues/172-touch-targets-below-44px.md) | DESIGN | Touch targets below 44px. | keep markup; kernel/ui components keep legacy sizes |
| [#173](../archive/issues/173-focus-rings-missing.md) | DESIGN | Missing focus-visible rings. | keep markup |
| [#178](../archive/issues/178-no-soft-deletes.md) | SCHEMA | Soft deletes or a recorded waiver. | owner |
| [#179](../archive/issues/179-db-structural-risks.md) | SCHEMA | Pooled URL + max connections, CONCURRENTLY, timezone normalization, RTL/emoji round-trip. | keep; kernel connectDb keeps max 10 like the legacy pool |
| [#182](../archive/issues/182-no-schema-validation.md) | SECURITY | Schema validation at every boundary. | FIX-IN-PORT: zod schemas on every endpoint/action as each module ports; close when census is 0 |
| [#183](../archive/issues/183-no-observability.md) | OWNER | Sentry + uptime monitor. | owner; kernel Log is the seam |
| [#192](../archive/issues/192-muted-text-contrast.md) | DESIGN | Muted text contrast ≥ 4.5:1, 12px floor. | keep markup |
| [#193](../archive/issues/193-emoji-as-ui.md) | OWNER | Emoji as meaning-bearing UI. | owner |
| [#322](../archive/issues/322-desktop-theme-prototype.md) | DESIGN | Desktop theme prototype variants. | prototype branch only |

## identity

| ticket | class | what remains | policy |
|---|---|---|---|
| [#169](../archive/issues/169-token-session-hygiene.md) | SECURITY | API token expiry + scopes, session idle timeout, PII log scrub. | keep behaviour; separate ticket (changes the Android contract) |
| [#174](../archive/issues/174-email-normalization-duplicates.md) | SECURITY+SCHEMA | Email normalization (case/+alias) at write and lookup; dedupe backfill. | keep behaviour; separate ticket (data backfill needs owner) |

## alerts

| ticket | class | what remains | policy |
|---|---|---|---|
| [#186](../archive/issues/186-no-queues.md) | STRUCTURE | Retries/backoff/DLQ for email and push. | keep; separate ticket (ports make it a one-adapter change) |

## family

| ticket | class | what remains | policy |
|---|---|---|---|
| [#138](../archive/issues/138-parity-family-folder.md) | DESIGN | Family routes parity. | keep markup |
| [#190](../archive/issues/190-children-data-consent.md) | OWNER | Children: age gate + verified parental consent. | owner |

## parsing

| ticket | class | what remains | policy |
|---|---|---|---|
| [#112](../archive/issues/112-parser-claims-cannot-overlap.md) | STRUCTURE | Route the whole 55-rule chain through the claim book; re-point the 272-test table. | keep behaviour; separate test-first ticket after the parsing port |
| [#188](../archive/issues/188-ai-safety-gaps.md) | SECURITY | AI prompt logs, injection delimiters, PII filter, eval harness. | keep; separate ticket |
| [#206](../archive/issues/206-bug-report-batch-2026-10-25.md) | BEHAVIOUR | "p.m." tokenization + second "at the y"; 500-class and mobile-nav repros. | keep behaviour; separate test-first NLP ticket |
| [#323](../archive/issues/323-shared-parse-vectors.md) | STRUCTURE | One dateVocab address; parse vectors drive both suites. | FIX-IN-PORT: the parsing module becomes the one address; vectors stay 145 in lockstep |

## groceries

| ticket | class | what remains | policy |
|---|---|---|---|
| [#074](../archive/issues/074-groceries-approved-layout.md) | DESIGN | 320px no-overflow check needs a real browser. | keep markup; do not regress |
| [#086](../archive/issues/086-migration-baseline-missing.md) | BEHAVIOUR | Verify the #115 store-colour scope-key question; retire stale bills SQL files in sql/ root. | FIX-IN-PORT: golden + repo tests pin personal-vs-family colour keys; SQL file cleanup stays a ticket |

## sponsored

| ticket | class | what remains | policy |
|---|---|---|---|
| [#180](../archive/issues/180-blob-store-public-unmetered.md) | SECURITY | Blob store public/unmetered: harden or delete the unwired code. | owner decides before the sponsored port wires a blob port |

## calendar

| ticket | class | what remains | policy |
|---|---|---|---|
| [#014](../archive/issues/014-events-calendar-med-low.md) | SCHEMA+BEHAVIOUR | Unique index on event_exceptions (+ duplicate sweep), DST ADR, exception edits must propagate to family mirrors (owner ruling 2026-10-15). | keep behaviour; separate ticket after the calendar port (needs DDL approval + ADR) |
| [#082](../archive/issues/082-calendar-window-fetch.md) | BEHAVIOUR | Import success link to first date; /api/events auth-scope pin test; live verify. | FIX-IN-PORT for the auth-scope pin (golden tests); rest stays a ticket |
| [#083](../archive/issues/083-import-preview-before-commit.md) | BEHAVIOUR | ICS import preview-screen tests, Playwright upload→commit, success-screen deep link. | FIX-IN-PORT for the tests (goldens + UI tests); deep link stays a ticket |
| [#106](../archive/issues/106-event-rsvp-summary-line.md) | DESIGN | Collapse the attendee list into a summary line. | keep markup |
| [#141](../archive/issues/141-parity-import-notifications-event.md) | DESIGN | Import/notifications/event parity. | keep markup |
| [#197](../archive/issues/197-svelte-5-57-migration.md) | STRUCTURE | Svelte 5.57: EventFormModal runes pattern (canSubmit never re-evaluates). | FIX-IN-PORT: v2 UI is runes-only with state classes |

## tasks

| ticket | class | what remains | policy |
|---|---|---|---|
| [#079](../archive/issues/079-tasks-page-spacing.md) | DESIGN | Filter-row, inbox and row-meta spacing polish. | keep markup; do not regress |
| [#113](../archive/issues/113-tasks-ts-six-modules-in-one-file.md) | STRUCTURE | tasks.ts split, shared section select, eventCalendarId on every list query, merge the 7 visibility queries. | FIX-IN-PORT for structure (the tasks port supersedes it); adding eventCalendarId to other lists is additive and stays a ticket |
| [#320](../archive/issues/320-desktop-task-read-panel.md) | BEHAVIOUR | Desktop task read panel (feature in progress on test). | port what has landed on `test`; the unfinished part is frozen there (Q-001) and waits for the owner |
| [#321](../archive/issues/321-convert-task-to-jira-linear.md) | OWNER | Convert task to Jira/Linear. | owner |

## access

| ticket | class | what remains | policy |
|---|---|---|---|
| [#175](../archive/issues/175-auth-guessing-surface.md) | SECURITY | Reset TTL ≤ 30 min; IP-only login cap + backoff. | keep behaviour; separate ticket |
| [#176](../archive/issues/176-mfa-absent.md) | OWNER | MFA: waive or build. | owner |

## marketing

| ticket | class | what remains | policy |
|---|---|---|---|
| [#095](../archive/issues/095-icon-synthesis-reads-as-calendar.md) | DESIGN | og/twitter/canonical tag audit; owner rules on theme_color. | keep behaviour |
| [#194](../archive/issues/194-marketing-glass-tiles.md) | DESIGN | Dead theme tokens; owner fork on glass/orbs. | keep markup |

## account

| ticket | class | what remains | policy |
|---|---|---|---|
| [#129](../archive/issues/129-settings-page-missing-the-prototypes-look.md) | DESIGN | Settings page measurements + four owner calls. | keep markup |
| [#140](../archive/issues/140-parity-account-folder.md) | DESIGN | Account folder parity. | keep markup |

## familyHub

| ticket | class | what remains | policy |
|---|---|---|---|
| [#098](../archive/issues/098-first-family-is-a-guess.md) | BEHAVIOUR | Duplicate family-tasks route crashes; two-family API tests. | keep URLs; add two-family goldens during the family/familyHub ports |

## dayDashboard

| ticket | class | what remains | policy |
|---|---|---|---|
| [#139](../archive/issues/139-parity-tasks-dashboard-groceries.md) | DESIGN | Tasks/dashboard/groceries parity. | keep markup |
| [#208](../archive/issues/208-dashboard-reflow-prototype.md) | OWNER | Dashboard reflow variant review. | owner |

## calendarPage

| ticket | class | what remains | policy |
|---|---|---|---|
| [#040](../archive/issues/040-calendar-load-vm-error.md) | OWNER | Console TypeError on calendar load — waiting on the reporter. | owner |
| [#119](../archive/issues/119-calendar-mobile-rail-must-not-exist.md) | DESIGN | Measure toolbar/fold at 1280×800; Prototype E review traffic. | keep markup |
| [#120](../archive/issues/120-calendar-toolbar-three-marks.md) | DESIGN | Fold measurement; keyboard parity after DayNav adoption. | keep markup |
| [#201](../archive/issues/201-cant-see-events-next-month.md) | BEHAVIOUR | Live-verify "can see next month's events" after #082. | keep; verify on the preview after the calendarPage port |
| [#202](../archive/issues/202-mobile-calendar-tap-targets-and-sandwich-menu.md) | BEHAVIOUR | Overflow-sheet toast ack, 360px Playwright spec, add-modal reassessment. | keep; port must not regress |

## app

| ticket | class | what remains | policy |
|---|---|---|---|
| [#016](../archive/issues/016-security-lows.md) | SECURITY | Widen the Origin check beyond /api/*; validate checkout finalPrice server-side. | keep behaviour; separate ticket |
| [#130](../archive/issues/130-the-gate-to-master-audit-marks-and-a-definition-of-done.md) | OWNER | The gate to master: owner screenshot approval per page. | owner (applies to cutover) |
| [#142](../archive/issues/142-security-fixes.md) | SECURITY | Every security finding fixed or waived by the owner, waiver recorded. | owner ledger stays; cutover checks it |
| [#143](../archive/issues/143-the-promotion-gate.md) | OWNER | Written pass/fail promotion checklist + owner sign-off. | owner (cutover) |
| [#177](../archive/issues/177-no-backups-pitr.md) | OWNER | Neon PITR restore drill. | owner |
| [#181](../archive/issues/181-no-csp-hsts.md) | SECURITY | CSP (nonced inline scripts) + HSTS. | keep; separate ticket after APP-03 |
| [#185](../archive/issues/185-iac-rollback.md) | STRUCTURE | Env parity, deploy pins commit, rollback script. | keep; separate ticket |
| [#198](../archive/issues/198-calendar-sync-verdict-review.md) | OWNER | Calendar sync verdict. | owner |
| [#199](../archive/issues/199-group-chat-video-rework.md) | OWNER | Group chat/video plan rework. | owner |

## Android (not part of the rewrite)

Active in docs/issues: [#210](../issues/210-native-android-app.md), [#280](../issues/280-task-categories-taskfocus.md), [#293](../issues/293-phone-focus-sessions.md), [#294](../issues/294-android-shell-theme.md), [#309](../issues/309-android-event-form-controls.md). The rewrite only owes them an unchanged `/api` contract.
