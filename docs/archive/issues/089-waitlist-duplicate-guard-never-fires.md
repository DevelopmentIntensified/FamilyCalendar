# 089 — The waitlist duplicate guard can never fire, and the endpoint is unthrottled

Status: done

Source: instruction — technical-debt sweep of schema, migrations, and dead code.

**Blocked by:** None (can start immediately).

## The problem

The waitlist insert declares that it does nothing on conflict, and the branch
that tells a returning visitor "you're already on the waitlist" sits right
underneath it. **That branch is unreachable.** The conflict target has no unique
constraint, so there is never a conflict to do nothing about, and every
submission inserts another row for the same address.

Email is declared plain non-null text. The primary key is an unrelated id. No
unique index exists in the schema, in any bundled migration, or in any generated
migration. There is also no application-level check before the insert.

Three more problems on the same path, all worth fixing in the same slice:

- **Unthrottled.** Every other public write in the app — login, signup, magic
  link, forgot password, phrase reports, bug reports — goes through the shared
  rate limiter. The waitlist join does not. It is unauthenticated, and it sends
  an email on every submission, so it is an email-bomb and cost-abuse vector.
- **Consent timestamps for a non-consenting submission.** Two consent fields are
  stamped on every row while the stored preferences are hardcoded to
  "opted out of everything". The row claims consent the form never collected.
- **Nowhere to read it.** There is no admin listing, and the row type is exported
  with no consumers. Personal data is collected, consent-stamped, emailed, and
  never looked at — which is the worst of both worlds for a retention question.

## Needs doing

- [ ] Add the unique index on the waitlist email column, with an explicit
      conflict target on the insert so the existing no-op-on-conflict actually
      means something. The "already on the waitlist" branch then goes live and
      the user gets a truthful message.
- [ ] Existing rows may already contain duplicates, and the index build will
      fail on them. Dedupe first (keep the earliest row per address), as part of
      the same migration. Note the table's declared primary key is an id while
      the oldest migration declares the email as the key — the baseline work
      (086) owns that reconciliation; land this after it, or make the migration
      tolerant of both shapes.
- [ ] Rate-limit the join on the same shared limiter and keying the other public
      writes use.
- [ ] Stop stamping consent for a submission that did not consent — or collect
      the consent the row claims. Pick one, and make the stored row tell the
      truth either way.
- [ ] Use the shared email validation if one exists instead of a bare regex.
- [ ] Tell the user when the confirmation email fails to send, instead of
      logging the failure and showing success.
- [ ] Tests: submitting the same address twice yields one row and the
      "already on the waitlist" message; a rate-limited caller is refused;
      consent fields match what the form actually collected.
- [ ] Decide where waitlist rows are read. If nothing reads them, they are
      marketing data with a retention question attached — give them an owner.

## Done

- Unique index added (`waitlist_email_key` on the `email` column,
  `src/lib/server/db/schema.ts`) and the insert now names an explicit conflict
  target: `.onConflictDoNothing({ target: waitlist.email })`. The
  already-on-the-waitlist branch is live.
  **Deviation from the ticket's "index on lower(email)":** drizzle-orm 0.45
  types `onConflictDoNothing.target` as `PgColumn` only and Postgres conflict
  inference needs the target expression to match the index, so a `lower()`
  expression index cannot have a working explicit target through drizzle. Same
  case-insensitive behavior achieved by: the action lowercasing at insert
  (already did), and the hand-run SQL lowercasing historical rows before
  building the index. SQL is identical to what `db:push` generates.
- Dedupe + index SQL for hand-running on prod/test (independent branches):
  `sql/HAND-RUN-2026-10-22-waitlist-dedupe-unique-email.sql`. Tolerant of both
  table shapes for 086 (keys rows by ctid, not id). NOT run anywhere remote;
  smoke-tested on the local docker test DB (dedupe keeps earliest, case
  normalized, index built, 0 dupes after).
- Rate-limited on the shared limiter (`src/lib/server/utils/rateLimit.ts`,
  `clientKey(request, 'waitlist-join')`, 5 per 10 min) with an injectable gate
  (`WaitlistDeps`), following the contact-page deps pattern.
- Consent fields stamped only when the form actually posts a consent field
  (`consent=on|true|yes`; the current form collects none, so rows stay null and
  no longer claim consent).
- Confirmation-email failure surfaced: the send is awaited and a provider
  failure returns fail(500) with "We saved your spot, but the confirmation
  email failed to send..."; the row stays (a retry gets the duplicate message).
  Email validation regex kept (no shared email validator exists in-repo;
  magicLink's is unexported lane-local).
- Tests (real-Postgres seam, mocks only at the provider boundary:
  `src/routes/(marketing)/waitlist/page.server.real.test.ts`, 7 tests): RED
  4/7 first (duplicate guard x2, consent stamping, email-failure), then GREEN
  7/7 after the fixes. toggleTaskComplete.real precedent, no vi.mock of db.
- Build green; prettier/svelte-check clean on touched files. Full-suite rollup:
  pre-existing unrelated client reds + a shared-DB race among real-Postgres
  suites when many files run together (toggleTaskComplete fails in trios while
  any pair passes — pre-existing harness property, see 002).
- NOT done here (stays open): an admin listing / owner for waitlist rows, and
  retention (cleanup-cron work owns both).

## Notes

- The dedupe migration is manual SQL for the user, per the repo rule.
- Retention for these rows belongs with the cleanup-cron work; do not build a
  second mechanism here.
- Two of the older migrations declare this table with a different shape
  (email as primary key, no id) — that contradiction is tracked in 086, and
  this migration was written to tolerate both shapes.
