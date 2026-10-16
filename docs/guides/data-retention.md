# Data retention & purge map

Where personal data physically lives, how long it stays there, and what
happens when a user deletes their account (or we must purge it on request).
Written for issue #189. Windows stated as **documented facts** (with the
source) or `[INFERENCE]` where the repo cannot verify them.

## DB purge map (all user-bearing tables)

Self-service deletion is `deleteUser` in
`src/lib/server/db/actions/users.ts:53-65`: one transaction that (1) resets
`tasks.assignmentStatus` that the FK set-null is about to orphan, (2) deletes
`activeSubscriptions` (the only user FK without a cascade), then (3) deletes
the `users` row. Everything else relies on `onDelete: 'cascade'` FKs.

| Table | Personal data | On user delete |
| --- | --- | --- |
| `users` | identity, email, phone, roles | deleted by `deleteUser` |
| `userSettings` | preferences | cascade via `userId` |
| `activeSubscriptions` | billing linkage | deleted before the user row (no cascade) |
| `sessions` | live login sessions | cascade |
| `codes`, `claim_tokens` | email-verification / claim tokens | cascade (codes by email column, claim_tokens via `userId`) |
| `familyMembers` | membership rows | cascade |
| `familyInviteCodes` | invite metadata | `[INFERENCE]` cascade — invite rows carry creator/family refs; verify FK direction if stricter compliance is needed |
| `events` | calendar events the user owns | cascade via `ownerId` |
| `eventAttendance` | own attendance rows | cascade via `userId` (host-family events lose your row) |
| `event_exceptions` | exceptions of owned events | cascade via `eventId` |
| `tasks` | created or assigned tasks | cascade on `userId` (`assignedTo` set-nulls, status cleared in the same tx) |
| `taskCompletions` | check-offs | cascade via `userId`; rows are gone, the surviving `tasks.completionCount` is a bare integer |
| `taskTags`, `itemTags` | tags (user-scoped learning) | cascade via task / `[INFERENCE]` for `itemTags` user scope — global learning rows a user fed (userId null) are not attributable, and are not purged |
| `bills` | bills | cascade via `userId` |
| `receiptItems` | receipt line items | cascade via `billId` |
| `grocery_items`, `grocery_store_memory` | lists / store learning | cascade for user rows; family-scope store memory is not deleted when a member leaves |
| `notifications` | bell messages | cascade |
| `pushSubscriptions` | device endpoints | `[INFERENCE]` cascade — verify FK on next migration pass; a stale endpoint is harmless (Resend/system 410s it) |
| `apiTokens` | token HASHES (no personal data besides name) | cascade |
| `aiUsageTracking` | usage counters | cascade |
| `adConsentRecords` | consent audit trail | `[INFERENCE]` retained: consent PROOF is usually kept after account deletion for compliance defense; policy decision not yet written down |
| `discounts`, `userDiscounts` | applied discounts | `[INFERENCE]` cascade via `userDiscounts.userId` |
| `subscriptionTypes` | plan catalog — no personal data | not purged |
| `bugReports`, `unmatchedPhrases`, `waitlist` | user-supplied but anonymous or per-email | separate lifecycles; waitlist email kept until manual purge `[INFERENCE]` |
| `meals`, `calendars`, `groups`, `familyGroups`, `userGroups`, `dashboardModuleSwitches`, `grocery_store_colours`, `familyGroups` | family-owned or catalog data | deleted only when the FAMILY is deleted; membership removal does not delete family payloads |

Two gaps the `deleteUser` tx does not close (mirrors issue #189): email
provider data, logs and backups — next three sections.

## Resend (transactional email)

All outgoing mail goes through Resend (`src/lib/utils/sendEmail.ts`, key env
`RESEND_API_KEY`). The app sends raw transactional emails
(`resend.emails.send`) — there is **no** Resend Contacts store, no audience
sync, no marketing list: `[DOCUMENTED]` nothing to purge provider-side for
contacts, because none are created.

Retention of Resend's own delivery logs / suppression list is
`[INFERENCE]` not visible from the repo: Resend keeps event/webhook logs for
a bounded period (commonly days, not years), and bounces may appear in the
Resend dashboard long-term. **Action owner:** console audit needed → record
observed windows here once checked. Any forwarded receipt-mail processed by
the ingest token is parsed and discarded per the privacy page ("the file
itself is never stored by us") — `[DOCUMENTED]`
`src/routes/(marketing)/privacy/+page.svelte` receipt paragraph.

## Vercel (hosting / logs / blobs)

- Build + runtime (serverless) logs: Vercel platform retention. `[INFERENCE]`
  Vercel retains request logs on the default plan for a rolling window
  (order of days); log drains could extend it, but none is configured in the
  repo — confirm in Vercel console → Logs.
  No app code writes user PII to logs deliberately; `console.error` calls
  may carry identifiers — acceptable under short retention `[INFERENCE]`.
- Vercel Blob stores strategy-ad assets only (see `docs/guides/backup-restore.md:16`);
  no user data is written to Blob storage `[DOCUMENTED]`.
- Vercel customer/account records (email address, billing) are Vercel's
  platform data, deleted per Vercel's own account processes — not
  automatable from here.

## Backups (Neon)

`[DOCUMENTED]` `docs/guides/backup-restore.md`: Postgres runs on Neon
(endpoint `ep-plain-cloud-a5hugp4l`); there are no classic backup FILES —
PITR is rebuild-from-WAL within the per-branch **history window**, plus
ad-hoc `pg_dump` drills (the only out-of-Neon copies).

- History window: `[INFERENCE]` 1 day worst case assumed in
  backup-restore.md ("needs human confirmation of history window"). Once the
  real window is confirmed (Neon console → Settings → Postgres → History
  window), substitute it here — a deletion becomes fully unrecoverable
  after `history window + last pg_dump timestamp`.
- pg_dump artifacts: `[DOCUMENTED]` created manually per
  backup-restore.md §drill; no automated dumps exist in the repo. Any dump
  is therefore a manual artifact with a manual deletion step — GDPR exports/
  erasures do NOT reach inside old dumps automatically. Open gap, owner:
  whoever runs the drill should timestamp + purge dumps alongside.

## Optional purge actions after `deleteUser`

For a completed erasure request:

1. `deleteUser` done (credentials invalidated immediately — sessions cascade).
2. Resend console: check Suppressions for the user's email address; delete
   the entry `[INFERENCE]` keeps nothing else user-identifiable.
3. Vercel: nothing to do beyond default log expiry `[INFERENCE]`.
4. Neon: nothing until WAL beyond the deletion timestamp rotates out of the
   history window (≤ documented window); document any pg_dump containing
   pre-deletion data and purge it manually.
5. `adConsentRecords`: decide keep (compliance proof) vs delete (strict
   erasure) — currently kept `[INFERENCE, see table above]`.
