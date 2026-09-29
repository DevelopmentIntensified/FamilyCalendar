# 088 — Ad consent lives on two tables, and the one that is read can never be set

Status: open

Source: instruction — technical-debt sweep of schema, migrations, and dead code.

**Blocked by:** None (can start immediately).

## The problem

Three booleans — whether ads render as events, whether ad markers show, and
whether ads are personalised — are declared **twice**: on the user settings row
and on a separate ad-consent row keyed by user.

They are not kept in sync, and they cannot be:

- The **ad-consent table is read at serve time**, and the read only asks "does a
  row exist". It never inspects the three booleans.
- That table has exactly **one writer** — a set-consent function that is called
  from nowhere in the repo. No route, no seed, no test.
- So the row can never come into existence, the serve-time check always returns
  false, and **ads never render at all** — the user's own
  "show ads as events" setting is read and then overridden by a check that can
  never pass.
- The settings-side save path does not include any of the three booleans in its
  payload, and the account page's ad-save action is an explicit no-op.
- Two of the three booleans (ad markers, personalisation) have **no read site and
  no write site anywhere at all** outside an object built for the account page
  that no component consumes.

Net effect: the app is in the safest possible state by accident, and a user
cannot tell whether ads are on, off, or governed by a table nobody writes.

## Needs doing

- [ ] Pick one table as the single source of truth. The settings row is the
      natural winner — it is where every other personal preference already
      lives.
- [ ] Make the serve-time check read that one field, and delete the second table,
      its writer, its reader, and the dead status helper.
- [ ] Delete the account page's no-op ad-save action and the ad-consent object it
      feeds if nothing consumes it.
- [ ] Decide what the user-facing ad controls are. Today the UI is disabled and
      the setting is invisible; either wire the three booleans into the settings
      save so the choice is real, or drop the two that nothing reads and stop
      implying a control exists.
- [ ] Reconcile the schema and add the forward migration for the dropped
      columns/table — via SQL handed to the user, not a push.
- [ ] Tests: the serve-time decision is a function of the one field; consent
      withheld means no ads, and there is one place that says so.

## Done

## Notes

- Safe to fix now, before the migration baseline (086) exists — but the DDL still
  goes to the user by hand.
- The ad-events table is a separate matter: it is written by the ad injection
  path and read by nothing. It is growth, not a consent bug — file it with the
  retention work.
- Removing a consent table raises one honest question: is any consent record
  needed for compliance? If yes, it is **not** a duplicate of a preference
  setting and needs its own shape. Answer that before deleting, do not assume.
