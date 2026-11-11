# 031 — Receipt item labeling + learning tag system

Status: done

Parent: #010 receipts (builds on its scan seam).

## User requirements (2026-09-07)

- Label individual receipt line items with different categories (not
  one category per receipt).
- User-level tagging that LEARNS: user corrections feed a global tag
  table so the system predicts better tags over time ("learns from the
  user how receipts should be tagged").
- Fast — and stays fast at 1000 labels.

## Design (hands-off, orchestrator assumptions recorded)

- `itemTags` table: id, `userId` (nullable — null rows are GLOBAL),
  `key` (normalized merchant or item name, lowercase trimmed),
  `category` (BILL_CATEGORIES), `weight` integer (usage count),
  `updatedAt`. Indexes: (userId, key) unique-ish, (key) for global
  lookups; category lookup is a single indexed batch.
- Learning loop (on bill save/confirm): for the merchant + each labeled
  item, upsert the USER row (weight+1, category = user's choice) AND
  the GLOBAL row (userId null, weight+1). Batched single-transaction.
- Prediction (on scan): lookup merchant key → user's own highest-weight
  row first, else global majority; item keys via one `inArray` batch.
  Two queries per scan total, indexed — O(log n) at any scale.
- Receipt UI: extracted line items each get a category select
  (suggestions = user's history first, then global top). Saving the
  bill persists items + labels + feeds the learning loop.
- Perf at 1000 labels:
  - DB: indexed key lookups — 1000 rows is trivial; no scans.
  - UI: never render 1000 nodes — suggestion list is a native
    `<datalist>` or filtered top-N (≤10) via prefix match on keystroke;
    input stays O(1) with a debounced filter.
  - Global aggregation stays read-time COUNT over indexed keys; revisit
    only past ~100k rows (materialized counters then).
- Line items stored: `receiptItems` table (billId FK, label, priceCents,
  category, position) OR JSON column on bills — implementer picks per
  house schema style; splitting a bill into multiple bills is OUT of
  scope (v1 labels items for tagging/learning; not expense splitting).
- TDD: learning loop (upsert weights, user-overrides-global), prediction
  precedence (user > global > keyword fallback), batched-query shape,
  normalization (case/punctuation), and a 1000-row perf smoke test
  (seed 1000 tags, assert query count + latency budget in the test).

- USER ADDITIONS (2026-09-07, grilling session):
  - Manual (non-scanned) bills get editable Line Items too — otherwise
    Spend Detail skews toward whatever was scanned.
  - **Tax and Fees are their own categories** (vocabulary: housing,
    utilities, subscriptions, insurance, tax, fees, other). Receipt
    tax/fee lines are labeled as such; the reconcile hint suggests
    adding a Tax line when items ≠ total. Bill category stays
    merchant-derived; Line Item Labels drive Spend Detail.
  - CODE-ONLY RECEIPTS (user, 2026-09-07): some receipts print only
    item codes. Decision rule: 12/13-digit numeric with valid GTIN
    check-digit → public lookup (Open Food Facts / upc.dev free tiers)
    for name+category; otherwise treat as STORE SKU → Tag Table learns
    (merchant, sku) → name + category from user labeling (user rows
    first, global rows fill in fast — stable codes shared by all
    shoppers of a store). Unlabeled code-only items render as
    "Item <sku> · $x.xx" with a name-it-once prompt; naming trains the
    table. Same indexed lookups — no perf change.
  - Spend Detail surface (Q4): (a) NOW — "Spend by category" card on
    the Bills page (month/range filter, category bars, tap → filtered
    bills); (b) follow-up — Day Dashboard module ("Spending", module
    enable/hide rules); (c) NOW TOO (user: "a, b and c") — dedicated
    Reports page split to #032 (trends, per-category drill-down).
- Vocabulary growth: closed vocabulary, DEV-CURATED — categories get
  added by devs based on popularity; users never create their own.
  Prediction chain: user history → global majority for that item →
  keyword heuristics → other.
- Retraining: any label edit/save upserts the Tag Table (user + global
  rows), not just first-time labels.

## Needs doing

- ~~Queued behind: strip-storage + privacy slice (#029 H3/M1/M2 + remove
  image storage) → OCR fallback chain → this (#031) → #006 recurring
  bills. Same files as receipts (bills page, scan seam) — strictly
  sequential. Receipts scan seam landed (commit 73761c0).~~

## Done

- **Schema** (`src/lib/server/db/schema.ts`, `sql/011-receipt-items-tags.sql`
  — applied to both local Docker DBs `familycalendar` + `familycalendar_test`;
  **NEON PENDING — see SQL block below**):
  - `BILL_CATEGORIES` extended with `'tax'`, `'fees'` (closed, dev-curated).
  - `receiptItems`: id, billId FK cascade, label, priceCents, category
    (nullable — null = inherits bill category), position, createdAt; index
    on billId.
  - `itemTags`: id, userId (nullable — null = GLOBAL), `key` (normalized:
    lowercase, trimmed, punctuation-collapsed, ≤120 chars), category, name
    (learned SKU display name), weight, updatedAt. One row per
    (scope, key, category); unique partial indexes
    `item_tags_user_key_category_unique` (userId,key,category) WHERE
    user_id IS NOT NULL and `item_tags_global_key_category_unique`
    (key,category) WHERE user_id IS NULL; plus `item_tags_key_idx` (key).
- **Tag Table service** (`src/lib/server/services/tagTable.ts`, 36 tests,
  red→green table-driven): `normalizeTagKey`, `isBareCodeLabel` (3–24
  digits), `deriveItemKey(merchant, label)` (bare codes become the
  merchant-scoped `(merchant sku)` key, space-joined so it is
  normalizeTagKey-stable), `predictCategory({merchant, itemKeys}, userId)`
  (EXACTLY 2 indexed batched queries: user rows via inArray, global rows via
  inArray; precedence user row → global majority (max weight) → null),
  `trainTagTable(userId, merchantKey, merchantCategory, entries)` (single
  transaction; user rows + global rows; weight+1 upsert, name fills in but
  never blanks; dedupes repeated keys per batch keeping the last category;
  'other' still trains), `topTags(userId, limit=50)` (user + global top-N
  for the preloaded datalist). Perf test: 1000 seeded rows, 100 keys,
  asserts exactly 2 queries + <50ms.
- **Bills API** (`src/routes/api/bills{,/[id]}/+server.ts`, 35 tests):
  create/update accept `items: [{label, priceCents, category?, name?}]`
  (labels/names ≤100 chars, integer cents ≥0, category in vocab or null,
  max 50) — validated BEFORE any write; replace-all semantics per update
  (`setBillItems` — one tx: delete old + insert positioned). Absent `items`
  leaves stored items untouched. Responses with items carry `items` +
  `itemsSum` + `unlabeled` (soft reconcile, never blocking). Every
  create/update WITH items retrains the Tag Table: merchant key = bill
  title (normalized), merchant category = bill category, per-item
  label-derived keys, learned SKU `name` passthrough. Items-only PUT skips
  the empty-patch bill update (drizzle set({}) throws).
- **Arch audit #4 category de-dup + cloud-scan bug fix (2026-09-08)**:
  `BILL_CATEGORIES`/`BillCategory` + the shared keyword table now live in
  client-safe `src/lib/data/categories.ts` (schema re-exports; no client
  imports of server schema). LIVE BUG fixed: client `receiptOcr.ts` carried
  a hand-copied `CLOUD_CATEGORIES` missing 'tax'/'fees' — Azure scans with
  those categories silently downgraded to 'other'; the drift-guard test
  (`src/lib/data/categories.test.ts`) now pins the cloud-normalization
  path to the full vocabulary. The two diverging keyword tables
  (receiptScan vs NLP) unioned into `CATEGORY_KEYWORDS` (81 words, 6
  ordered entries) + `categoryForKeyword` matcher; shared `isBillCategory`
  replaces the three copies (actions/bills.ts, receiptText.ts,
  email-ingest). Deliberate specificity call: bare 'oil' is NOT a keyword
  (SHELL OIL FUEL is a gas station, not a utility) — only "heating oil"
  matches.
- **Keyword tables**: `receiptScan.ts` category table + client `BillCategory`
  union gained tax/fees (tax, taxes, sales tax, vat, gst; fee(s), surcharge)
  — applied ONLY to single-line inputs (item labels / merchant names);
  multiline whole-receipt scans stay merchant-derived (every receipt prints
  a TAX summary line). `azureReceiptService` now derives the bill category
  from the merchant alone (was merchant + item labels — line-item labels
  must never absorb the bill's category). `naturalLanguageService`
  BILL_CATEGORY_KEYWORDS gained tax/fees rows (first, so explicit tax/fee
  words win); 10 new table cases.
- **Bills page** (runes, `+page.svelte`, 32 client tests, autofixer clean):
  - Line Items editor in the expanded detail (all bills, manual too):
    label (datalist suggestions) + price + category select ("Inherit" +
    vocabulary), remove, add (≤50), Save → PUT replace-all → invalidateAll.
  - Create form gains an optional Line Items section, collapsed by default;
    sent only when it has usable rows.
  - Code-only items: bare 3–24-digit labels render "Item <code> · $x.xx"
    with a name-it-once prompt; the learned `name` rides the save payload
    and trains the (merchant, sku) key. Stored drafts are pre-filled with
    the learned name from the preloaded Tag Table rows.
  - Suggestion badges: "your history" (user row) / "common" (global row).
  - Suggestions: preloaded user+global top-50 at load (`topTags`), filtered
    client-side to ≤10 into one native `<datalist>` — no per-keystroke
    server calls; 1000-row sets never render as DOM nodes.
  - Reconcile hint: when |bill total − items sum| > 1¢ → amber
    "Items sum to $X of $Y — add a tax/fees line?" with one-tap
    "Add 'Sales tax' <remainder>" (category tax).
  - Spend Detail card (surface a): month select (distinct dueDate months +
    All time; `?month=` drives the server aggregation; default current UTC
    month), category bars (amount + share), tap toggles a filtered bill
    list ("Show all" clears).
- **Spend aggregation** (`src/lib/server/services/spendDetail.ts`, 10
  tests, pure): `billsInMonth` (UTC dueDate month filter; undated
  excluded), `spendByCategory(bills, itemsByBillId)` — bills WITH items
  contribute each item's price under its Label category (null inherits the
  bill's), bills WITHOUT items contribute the full amount under the bill's
  category; slices sorted by cents desc with contributing billIds. One
  bills query + one items query per load, aggregation in memory.
- Gates: vitest 1612 server+client tests green (full run), playwright
  e2e/bills + e2e/mobile green, oxlint 0/0, prettier clean, `npm run check`
  0 errors, `npm run build` passes, svelte-autofixer clean on `+page.svelte`
  except two documented deviations:
  - "goto() without resolve()" — `$app/paths#resolve` needs kit ≥2.26; the
    repo pins kit 2.17.2. Dependency upgrade intentionally out of scope.
  - spendMonth `$state` + `$effect` sync — writable `$derived` binding is
    rejected by this svelte-check/svelte (5.20.1) pair ("Cannot bind to
    derived state"); the effect keeps the select synced with `?month=`
    navigations.
  - (`bind:this` on the scan input and a per-derivation `new Set` in
    spendMonths are pre-existing/cosmetic suggestions.)

**Neon SQL to apply (production-bound — sql/011-receipt-items-tags.sql):**

```sql
CREATE TABLE IF NOT EXISTS "receiptItems" (
	"id" text PRIMARY KEY NOT NULL,
	"billId" text NOT NULL REFERENCES "bills"("id") ON DELETE cascade,
	"label" text NOT NULL,
	"price_cents" integer NOT NULL,
	-- NULL = inherits the parent bill's category.
	"category" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "receipt_items_bill_idx" ON "receiptItems" ("billId");

CREATE TABLE IF NOT EXISTS "itemTags" (
	"id" text PRIMARY KEY NOT NULL,
	-- NULL = GLOBAL row (learned across all users).
	"userId" text REFERENCES "users"("id") ON DELETE cascade,
	"key" text NOT NULL,
	"category" text NOT NULL,
	-- Learned display name for code-only (store-SKU) items.
	"name" text,
	"weight" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "item_tags_user_key_category_unique"
	ON "itemTags" ("userId", "key", "category") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "item_tags_global_key_category_unique"
	ON "itemTags" ("key", "category") WHERE "userId" IS NULL;
CREATE INDEX IF NOT EXISTS "item_tags_key_idx" ON "itemTags" ("key");
```

### Deferred

- (a) Day Dashboard "Spending" module → follow-up; (c) Reports page → #032.
- Public GTIN lookup (Open Food Facts / upc.dev) for valid check-digit
  codes → #033's scan lane; this slice covers the store-SKU seam only.
- Email import (#033) calls `predictCategory`/`trainTagTable` at scan time
  — the seam is built and contract-tested, not wired.
- Paid-state is not part of Spend Detail yet (spend = amounts owed in
  range, regardless of paidAt) - revisit with #006/#032 if the user wants
  paid-only views.

### Architecture: deep `applyBillSave` module (candidate #1, 2026-09-08)

The "save a Bill" 6-step choreography (validate → create/patch → items
replace-all → Tag Table training gate → draft confirm → paid cursor
advance) was hand-coded in both write routes with verbatim-duplicated
helpers. Extracted into one deep module, `src/lib/server/services/billSave.ts`:

- `applyBillSave(deps, caller: {userId}, input: {billId: string | null, body: unknown})`
  → `{ bill, items, itemsSum, unlabeled, events: {advancedTo, trained} }`.
- Owns: body validation (reuses actions/bills boundary parsers — thrown
  as `BillSaveValidationError` before anything persists), create-or-update
  semantics, items replace-all, reconcile summary, the training gate
  (`source !== 'manual'` → never train; confirm flips draft → manual then
  trains; 'other' trains), and the paid cursor advance (unmark/one-off
  no-op). Authorization lives here too (`BillSaveNotFoundError`, same
  body as not-found so existence is never confirmed to non-members).
- `BillSaveDeps` = 9 repo-level collaborators, one seam shared by POST,
  PUT (and GET/DELETE via `& {getBillsForUser}` / `& {deleteBill}`).
- Routes shrank to auth + JSON mapping: POST 166→52 LOC, PUT route file
  249→81 LOC; response shapes unchanged (e2e + page tests pin them).
- Gate matrix pinned table-driven in `billSave.test.ts` (26 tests);
  route tests slimmed to auth/limits/JSON-mapping (81 total across the
  3 files, all green).
