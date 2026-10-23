# 087 — The changelog, roadmap and privacy policy advertise a subsystem that was archived

Status: done

Source: instruction — technical-debt sweep of schema, migrations, and dead code.

**Blocked by:** None (can start immediately).

## The problem

The Bills and Receipts surface was archived to `_attic/money/` in Sept 2026 (see
063). The routes are gone. Nothing in the app reads the tables. But the public
marketing surfaces still describe the feature as shipped and working.

### The changelog

Three entries describe features that do not exist:

- "Scan receipts straight into your bills" — "Snap a photo of a receipt and the
  details fill in your bill automatically."
- "Quick-add now understands bills" — "…it becomes a bill with the amount and
  due date already set."
- "Bills, tidied up" — "**Mark bills paid with one toggle**, spot overdue ones at
  a glance with an overdue pill…"

The changelog page's SEO description still says "receipt scanning".

### The roadmap

Four entries sit under **Shipped** / "Live in the app today" that are not:
Bill tracking ("mark bills paid"), Receipt scanning, Quick-add for events and
bills, and — further down — a spend report and recurring bills. The same file
has a "coming next" section; some of what the changelog claims shipped belongs
there instead.

### The privacy policy

The most serious one, because it is a factual claim about data handling that a
user could rely on. It names a receipt-ingest email address as a data processor,
describes forwarded receipt emails becoming a draft bill, and states that
receipt scanning and receipt-PDF text extraction run on the user's device. No
such address is live and no such flow runs. The processing table in the policy
should not list a processor the app never calls.

### The tables

`bills`, `receiptItems` and `itemTags` are still declared in the schema and still
created by a bundled migration, with zero readers anywhere in the app. They are
## Done

- 2026-10-19: changelog — the three Bills entries removed ("Scan receipts
  straight into your bills", "Quick-add now understands bills", "Bills, tidied
  up"); the entries describe a feature no user could reach.
- 2026-10-19: roadmap rewritten — Shipped now lists Quick-add for events,
  Task visibility, Family hub redesign, Grocery lists; Spending reports and
  the four money "coming next" items removed; Coming next carries one honest
  item (Calendar sync — research underway, `docs/research/calendar-sync-*`).
- 2026-10-19: privacy policy — the "Resend (receipt email forwarding)"
  processor row removed (the app never calls it for receipts); the
  receipt-scanning/PDF footnote paragraph removed; Neon row now reads
  "calendars and tasks"; "Last updated" bumped to October 2026. Ad-image
  upload disclosure on the Vercel row kept (ads are live, unlike money).
- The changelog SEO description was already fixed before this slice
  (`$lib/marketing/seo.ts` deliberately does not name features — comment cites
  this issue).
- 2026-10-19: whole-marketing grep for `bill|receipt|spend|burn|ingest` —
  only legitimate pricing "billing period" text remains. Sweep clean.
- 2026-10-23: re-verification pass, whole-marketing grep rerun over the full
  `src/` tree. Marketing surfaces have NO live copy hits — the only matches
  are: the code comments in `changelog/+page.svelte:19` and
  `src/lib/marketing/seo.ts:74` citing this very issue (both author-only,
  never rendered), and legitimate pricing `billing period` text. Verified
  additionally: `src/lib/data/changelog.ts` (9 entries, zero money ones),
  `src/lib/data/roadmap.ts` (shipped = quick-add events / task visibility /
  family hub / grocery lists; coming-next = calendar-sync research only),
  privacy policy `+page.svelte` (the surviving Resend row is sign-in-emails,
  not receipt ingest; Neon row = "calendars and tasks"; "Last updated:
  October 2026"; no receipt-scanning footnote), meta/og copy in `seo.ts`
  (features row's "ICS import" is live — `(calendar)/calendar/import`
  runs `parseIcs`), and emoji rule check over `(marketing)`
  (only the approved 👨‍👩‍👧‍👦 plus neutral 🏈📧✅ — no forbidden emoji).
  Cross-checked the one app-side money claim: `AccountDangerSection.svelte:45`
  lists "bills and receipt lines" in the data export — the export at
  `src/lib/server/db/actions/export.ts:188-193` really reads `bills` +
  `receiptItems` (the tables still exist), so it is a factual description of
  the download, not an advert. No copy edits were required this pass; ticket
  flipped done on grep evidence.

## Needs doing

Both items below are residue from the money lane, deliberately outside this
copy-only ticket; they stay recorded here so they are not dropped on flip.

- Table fate (`bills`, `receiptItems`, `itemTags`) — blocked by #086 (dropping
  tables needs child-first ordering, and the archived code in `_attic/money/`
  reads them; deleting DDL before the baseline exists makes 086's job harder).
- `parseBillQuickAdd` in the natural-language service (~400 lines of tests, no
  production caller) — remove when the money lane's NLP vocabulary split lands
  (`src/lib/data/categories` keeps the live part).

## Notes

- Do **not** treat "the changelog is a historical record" as a reason to keep
  these entries. A changelog entry for a feature no user could ever reach is a
  false statement about our own product.
- The archived code under `_attic/` is dead weight but is not a public claim. The
  privacy policy and the changelog are what users actually read.
- Dropping the tables is deliberately separated: it collides with the manual-SQL
  rule and with the migration baseline work (086). Deleting the DDL before the
  baseline exists would make 086's job harder.
- `parseBillQuickAdd` in the natural-language service has ~400 lines of tests
  and no production caller — same shape of problem, flagged here so it is not
  forgotten.
