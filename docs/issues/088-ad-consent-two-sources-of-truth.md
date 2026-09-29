# 088 — Ad consent lives on two tables, and the one that is read can never be set

Status: in-progress

Source: instruction — technical-debt sweep of schema, migrations, and dead code.

**Blocked by:** None. Code shipped 2026-09-29. The DDL below is for the user to
run by hand; nothing depends on it being run first.

## The problem

Three booleans — whether ads render as events, whether ad markers show, and
whether ads are personalised — were declared **twice**: on the user settings row
and on a separate ad-consent row keyed by user.

They were not kept in sync, and they could not be:

- The **ad-consent table was read at serve time**, and the read only asked "does
  a row exist". It never inspected the three booleans.
- That table had exactly **one writer** — a set-consent function called from
  nowhere in the repo. No route, no seed, no test.
- So the row could never come into existence, the serve-time check always
  returned false, and **ads never rendered at all** — the user's own
  "show ads as events" setting was read and then overridden by a check that
  could not pass.
- The settings save path never included any of the three booleans in its
  payload, and the account page's ad-save action was an explicit no-op.
- Two of the three (ad markers, personalisation) had **no read site and no write
  site anywhere at all**, outside an object built for the account page that no
  component consumed.

The app was in the safest possible state by accident, and a user could not tell
whether ads were governed by a setting they controlled.

## Done

- **One source of truth.** `shouldServeAds(settings)` in the ad service is the
  whole decision, and it reads exactly one field: `userSettings.showAdsAsEvents`.
  No "does a row exist" check anywhere.
- **Ads are opt-in, not opt-out.** The field defaults to `false`, and a missing
  settings row, a null flag or a false flag all mean no ads. The previous
  default was `true`.
- **The duplicate table is gone** — the `userAdConsent` declaration is deleted,
  along with its writer, its reader, the dead status helper, the account page's
  no-op ad-save action, and the unconsumed ad-consent object the page built.
- **The two dead booleans were dropped, not wired.** `showAdMarkers` and
  `personalizedAds` were read and written nowhere. A stored flag nobody reads is
  a switch that does nothing — the exact class of bug this ticket exists to
  remove — so they are gone rather than given a control.
- **There is now one real control.** The account page's calendar settings has a
  Sponsorship section with a single checkbox, inside the existing save form, so
  it persists through the same path as every other preference. It states plainly
  that nothing sponsored is shown and nothing shared while it is off.
- **One fewer query on the calendar load.** The ad guard used to run its own
  consent SELECT; it now reads the settings row the page already loads, so the
  ads leg costs nothing when consent is withheld.
- **Tests (9, new suite).** The serve-time decision is pinned as a pure
  function: no settings row, null and false all refuse; true serves. A second
  group pins the same decision end to end through the ad-generation path.

## SQL for the user to run

Hand-run this; do not add it as a migration file until #086 has a baseline, and
do not rely on a push.

```sql
-- 088: the ad gate is now userSettings.showAdsAsEvents. Nothing reads the
-- second table, so it goes. Idempotent.
DROP TABLE IF EXISTS "userAdConsent";
```

Before running it, confirm the table is truly unreferenced in your environment:

```sql
SELECT count(*) FROM "userAdConsent";
-- any rows here are consent records collected for a gate that could never
-- pass. Read them before dropping; they may matter for a privacy request.
```

## Needs doing

- [ ] **The user runs the DDL above** and confirms the table is gone.
- [ ] Decide whether the ad-events table is wanted at all. It is written by the
      ad injection path and **read by nothing** — no reporting query exists
      anywhere in the app. It is retention work, not consent work, and belongs
      with #029's M5.
- [ ] **The compliance question is unresolved and deliberately not answered
      here.** If an ad-consent *record* is needed for a privacy request or a
      legal obligation, it is not a duplicate of a preference setting and needs
      its own shape and its own retention. This ticket assumed the answer is
      "no". That assumption is load-bearing — if it is wrong, this is the wrong
      design and the table should come back in a different form.

## Notes

- The consent table was not in the migration baseline (#086) and is not in
  `drizzle/`, so nothing else has to be reconciled.
- The dashboard still cannot show a sponsored event: the dashboard loader does
  not select ad events, so the card's ad path is tested but unreachable. Same
  shape as the parked Meals card — worth deciding whether sponsored items on
  the dashboard are wanted at all before building the plumbing.
