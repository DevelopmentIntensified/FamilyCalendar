# Port sheet: bills

**domain** · rank 6 · port #7 · home: `src/lib/domains/bills/` · README after the port: `src/lib/domains/bills/README.md` (written in S1)

PARKED (bills archived 2026-09-25). Owner answer [Q-002](../questions.md): delete-only. The bill parser and the category list go; only the tables remain (in kernel after K-04).

- **May import:** kernel, identity, billing, alerts, family, dashboardModules.
- **Owns tables:** `bills`, `receiptItems`, `itemTags`.
- **Must be ported first:** nothing (from the legacy import graph; see the ledger).
- **Playbook:** [port-a-module.md](../playbooks/port-a-module.md).

## Steps

- [ ] S1 behaviour inventory (README Invariants) + design (public interface, file plan)
- [ ] S2 `/api` goldens, green on legacy — S2 commit sha: `________`
- [ ] S3 contract + rules
- [ ] S4 repo (+ fixtures)
- [ ] S5 service
- [ ] S6 http + route wiring (goldens unchanged since S2)
- [ ] S7 UI rebuild (rules, api, state, components, screen) + visual check
- [ ] S8 rewire importers, delete legacy code and legacy tests
- [ ] S9 README final, census --write, gate:push, ledger done

## Must survive

Behaviour the port must keep (each becomes an Invariant in the README, pinned by a test):

- DELETE-ONLY (Q-002). Remove `parseBillQuickAdd` and the bill grammar from `src/lib/server/services/naturalLanguageService.ts` (the `BILL_CATEGORY_SET` block through the end of `parseBillQuickAdd`) with their tests, `src/lib/data/categories.ts` with `categories.test.ts`, and the `BILL_CATEGORIES` re-export in the legacy schema file. Afterwards `git grep -n "data/categories\|BILL_CATEGORIES\|parseBillQuickAdd" -- src e2e` finds nothing outside `_attic/`. The `bills`, `receiptItems` and `itemTags` tables stay exactly as they are (no DDL).

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
none — the module owns no `src/routes/api/**/+server.ts` and no page route; its whole contract is the exported vocabulary + matcher (`src/lib/data/categories.ts`).

### Rules the module must keep
- The vocabulary is closed and ordered exactly `housing, utilities, subscriptions, insurance, tax, fees, other`; `BillCategory` is derived from that tuple and `isBillCategory` is pure membership (rejects `'TAX'`, `''`, `null`, `undefined`, numbers, objects) — `src/lib/data/categories.ts:15-34` · test: `src/lib/data/categories.test.ts` › "is the closed #031 vocabulary", "rejects non-members"
- `BILL_CATEGORIES`/`BillCategory` are authored here and **re-exported by** the server schema, never duplicated; the test compares the two bindings — `src/lib/data/categories.ts:1-12`, `src/lib/server/db/schema.ts:702-707` · test: `categories.test.ts` › "matches the schema re-export exactly"
- Keyword matching is a single ORDERED table where the first entry with any matching word wins: `tax` then `fees` first so an explicit tax/fee line is never absorbed into a merchant category; `subscriptions` before `insurance` so "youtube premium" reads subscriptions; `housing` last — `src/lib/data/categories.ts:37-143` · test: `categories.test.ts` › "every word resolves to its own entry via categoryForKeyword (no order shadowing)"
- Every category except `other` has at least one keyword; `other` has an empty word list and is the caller's fallback, never a matcher result — `src/lib/data/categories.ts:49-145,165-174` · test: `categories.test.ts` › "gives every category at least one keyword (except \"other\" — the fallback)"
- Words are lowercase, de-duplicated, and compiled once into case-insensitive word-boundary regexes, so partial words never match ("thunder", "taxation", "MAXIMUM flexibility", "renters rights") while "NETFLIX.COM"/"GEICO" do — `src/lib/data/categories.ts:146-162` · test: `categories.test.ts` › "words are lowercase (matcher contract)", "matches are case-insensitive"
- `oil` is deliberately not a bare keyword (Shell Oil Fuel is a fuel station, not a utility); only the phrase "heating oil" matches — `src/lib/data/categories.ts:43-47,76` · test: `categories.test.ts` › `"SHELL OIL FUEL" → null`
- `categoryForKeyword(text, exclude?)` returns the first matching category or `null`, and `exclude` skips whole entries (receipt scans exclude `tax`/`fees` so a whole grocery receipt is not absorbed into tax) — `src/lib/data/categories.ts:158-174`
- Big-box contract: Home Depot and Lowe's are `housing` keywords; Walmart and Amazon carry no keyword, so a general-merchandise receipt matches nothing and callers land in `other` (the Tag Table learns specifics per item) — `src/lib/data/categories.ts:127-143` · test: `categories.test.ts` › "categoryForKeyword (#034 big-box merchants)"
- The parsing module consumes this vocabulary as its final category authority: a bill quick-add `#tag` counts only when it is exactly a `BILL_CATEGORIES` member, otherwise keywords scan the original text, and the result defaults to `other` — `src/lib/server/services/naturalLanguageService.ts:2221,2466-2488,2563` · test: `src/lib/server/services/naturalLanguageService.test.ts` › "unknown #tag with unknown merchant lands in other"
- Table contract: `bills.amountCents` is a non-null integer (never float), `bills.category` is non-null text defaulting to `'other'`, `dueDate`/`paidAt`/`frequency`/`interval` are nullable (both schedule columns null = one-off); `receiptItems.category` is nullable and null means "inherit the bill's category", `priceCents` integer, rows cascade with their bill; `itemTags` has nullable `userId` (null = global row, set = per-user override), normalized `key`, integer `weight`, and a partial unique index per (user, key, category) because Postgres treats NULLs as distinct — `src/lib/server/db/schema.ts:709-742,745-773,775-805`

### Page and UI behaviour worth keeping
- none — no page or endpoint is owned; the only user-visible effect is the category label stored on a Bill, Receipt Item, or Tag Table row (`src/lib/server/db/schema.ts:717,758,787`).

### Probably accidental (candidates to drop, owner to confirm)
- Bare keywords `apple`, `prime`, `max` and `membership` match ordinary phrases ("apple picking" → subscriptions, "prime rib" → subscriptions, "max" anywhere word-bounded → subscriptions, "gym membership" → subscriptions) — `src/lib/data/categories.ts:94,102,104,108` — why: single common nouns used as brand tokens without a merchant context
- The "drift guard" test compares `BILL_CATEGORIES` with `SCHEMA_BILL_CATEGORIES`, but the schema re-exports the same array binding, so the assertion can never fail — `src/lib/data/categories.test.ts:11-16`, `src/lib/server/db/schema.ts:707` — why: the guard duplicates the source instead of detecting a second copy
- `escapeRegExp` is re-implemented locally although `dateVocab.escapeRegExp` is already the shared helper — `src/lib/data/categories.ts:154-156`, `src/lib/utils/dateVocab.ts:269-271` — why: second copy of a shared utility
<!-- inventory:end -->

## Carry-over tickets

None.

## Plan

(S1: list every new file with its role, and where each legacy export goes.)

## Notes

(Surprises, decisions, files kept for unported importers.)

## Census

<!-- census:begin (generated by npm run census -- --write) -->
```text
# bills: 0% ported

legacy source files left (1/1, 175 LOC):
  - src/lib/data/categories.ts (175 LOC, model) importers: 7

route files not yet wiring-only (0/0):

legacy test files left (1/1) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/data/categories.test.ts [pure, 9 tests]
```
<!-- census:end -->
