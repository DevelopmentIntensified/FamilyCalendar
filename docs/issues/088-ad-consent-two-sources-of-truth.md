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
- **A consent RECORD now sits beside the setting** (see below) — the owner's
  answer to the compliance question this ticket had left open. It is additive:
  the gate above is unchanged and nothing new is read at serve time.

## SQL for the user to run

**088b APPLIED 2026-10-03 via Neon.** `adConsentRecords` and its composite index
exist on **both** branches of `hidden-resonance-16080139` (`main` and
`preview/test`), verified against `information_schema` and `pg_indexes`. The
table is empty, which is correct: nobody has toggled ads since the code shipped.

**Step 7 — dropping `userAdConsent` — NOT run.** It is verifiably empty (0 rows
against 239 users) and holds only booleans, so no consent history can be lost.
It is still not dropped: an irreversible statement waits for an explicit
instruction, not an inference from an empty result.

Verified while connected: the live schema has **40 tables**. `grocery_items`
and `grocery_store_memory` exist — snake_case, which is why a camelCase probe
misses them — and both are empty. `userAdConsent` had never been written, the
predicted consequence of its only writer having no callers.


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

### 088b — the consent RECORD (owner's answer: yes, a record is wanted)

The compliance question above was answered **yes**, in a form that does not
reopen the decision already shipped. The evidence is kept; the setting is not
duplicated.

```sql
-- 088b: one row per consent EVENT — granted or withdrawn, timestamped, with
-- the user it belongs to. Append-only; no unique key on userId, because a
-- record is a trail and not a current value. Cascades on user delete with
-- every other user-scoped table.
-- Idempotent. Run AFTER the DROP above.
CREATE TABLE IF NOT EXISTS "adConsentRecords" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"decision" text NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "adConsentRecords_userId_users_id_fk"
		FOREIGN KEY ("userId") REFERENCES "public"."users"("id")
		ON DELETE cascade ON UPDATE no action,
	-- Only two decisions exist. A CHECK means a bad value cannot reach the
	-- table even if the app's writer is bypassed.
	CONSTRAINT "adConsentRecords_decision_check"
		CHECK ("decision" IN ('granted', 'withdrawn'))
);

-- "Prove I consented" / "when did they withdraw" are per-user history reads,
-- newest first.
CREATE INDEX IF NOT EXISTS "adConsentRecords_userId_recordedAt_idx"
	ON "adConsentRecords" ("userId", "recordedAt");
```

Verify after running:

```sql
SELECT indexname FROM pg_indexes WHERE indexname = 'adConsentRecords_userId_recordedAt_idx';
SELECT * FROM "adConsentRecords" ORDER BY "recordedAt" DESC;
```

## The consent record (088b)

**Shape.** `adConsentRecords(id, userId, decision, recordedAt)`. One row per
consent *event*: `decision` is `'granted'` or `'withdrawn'`, `recordedAt` is
when it happened, `userId` is whose it was. That is exactly the three questions
asked — who, which consent, when — and nothing else.

**Why a record and not a setting.** A current boolean answers "do ads show
now". It cannot answer "prove I consented" (a `false` today destroys the only
evidence that there was ever a `true`) or "when did they withdraw" (no
timestamp). Those are the questions a privacy request asks, and they are why
this table exists. It is **append-only**, with no unique key on `userId` —
which is precisely the flaw of the deleted `userAdConsent` table, whose
`userId` primary key allowed exactly one row per user and therefore could not
have recorded history at all.

**Nothing renders differently.** `shouldServeAds(userSettings)` remains the
whole serve-time gate, reading exactly one field on the settings row. No row in
`adConsentRecords` is read anywhere on the request path, and no row in it can
change whether an ad appears. Four tests pin this, including one that puts a
`granted` row on file and a `false` setting, and asserts ads are still
withheld: a record is evidence of a past event, never a live permission.

**Written on transition, not on read.** The account page's
`saveCalendarSettings` action captures `existingSettings.showAdsAsEvents`
*before* the write and calls `recordAdConsentChange(userId, previous, next)`.
`adConsentDecisionFor` returns `null` when the two agree, and the writer
appends nothing. Saving the form to change some other preference writes no
consent row. Writing a row per serve would be a log, not consent — pinned by a
test asserting the serve path writes nothing to this table.

**A user who never touched the setting has no record — by design.** The owner
asked for a ruling. The answer is **no record**, and the code enforces it
rather than leaving it to convention:

- There was no event. A record is evidence that a decision was made. Nobody
  decided anything.
- Writing `"declined"` for someone who never saw the control fabricates a
  refusal. A privacy request answered from that row would state, as fact,
  something the user never said.
- The default is already safe. `showAdsAsEvents` defaults to `false`, so a
  never-touched user is already getting no ads. A "declined" row would add
  nothing to their protection and would only misrepresent the interaction.
- The absence is informative. "No record" reads as *never asked*, which is
  true and useful; a fabricated row would erase that distinction.

So the first *real* interaction — ticking the box — is what creates the first
row, `granted`. Unticking it later appends `withdrawn`. Both are answers to
the privacy questions; neither fabricates.

## Needs doing

- [ ] **The user runs the DDL above** — the `DROP` and the `CREATE` — and
      confirms both land.
- [ ] Decide whether the ad-events table is wanted at all. It is written by the
      ad injection path and **read by nothing** — no reporting query exists
      anywhere in the app. It is retention work, not consent work, and belongs
      with #029's M5.
- [ ] Decide the retention period for `adConsentRecords`. Evidence ages
      differently from a preference: a withdrawal must be provable long after
      the fact, but the trail also cannot become an unbounded log. No purge
      job is written.
- [ ] Wire `getAdConsentRecords(userId)` to a user-facing privacy view. It
      exists and is tested as the read path, but no page calls it yet — so
      today the only way to answer "prove I consented" is a direct SQL query.

## Notes

- The consent table was not in the migration baseline (#086) and is not in
  `drizzle/`, so nothing else has to be reconciled.
- `analyticsService.trackAdConsentChange` and its `adConsentEnabled` /
  `adConsentDisabled` KPI fields are still hardcoded zeros and a `console.log`.
  Left alone here — out of scope for the gate and the record — but they are
  dead counters pretending to be metrics, and the record is what they should
  have been counting.
- The dashboard still cannot show a sponsored event: the dashboard loader does
  not select ad events, so the card's ad path is tested but unreachable. Same
  shape as the parked Meals card — worth deciding whether sponsored items on
  the dashboard are wanted at all before building the plumbing.
