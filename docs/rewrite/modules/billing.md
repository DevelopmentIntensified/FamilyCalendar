# Port sheet: billing

**domain** · rank 2 · port #3 · home: `src/lib/domains/billing/` · README after the port: `src/lib/domains/billing/README.md` (written in S1)

Plans, subscriptions, plan limits (family size, archive), discounts, checkout stub, AI spend cap and usage.

- **May import:** kernel, identity.
- **Owns tables:** `discounts`, `userDiscounts`, `subscriptions`, `subscriptionTypes`, `aiUsageTracking`.
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

- AI cap: unauthenticated callers never reach the LLM; over-cap → 429 with zero vendor spend; opted-out users skip the cap check; usage recorded even when the parse returns null.
- Paid tiers have no short-window parse cap; free = 20 per 5 min with silent regex fallback (#317).
- Plan limits (family size, archive access); 999 means "no limit".
- `/api/me/subscription` summary shape (Android).

## Behaviour inventory (draft — verify in S1)

Extracted from the legacy code and tests on 2026-11-11 as a starting point for S1. It is not authoritative: check each line against the code before relying on it.

<!-- inventory:begin -->
### API surface
| route | method | auth | input (fields; absent vs null rules) | success | errors (status: exact message) | evidence |
|---|---|---|---|---|---|---|
| `/api/me/subscription` | GET | signed-in (Bearer or session) | none | `200 {subscription:{tier, subscription:{id,startDate,endDate,createdAt}}\|{tier:null,subscription:null}, planLimits, aiUsage:{used,limit,remaining}, planPricing:{monthly,annual,lifetime,monthlyEquivalent}}`; any read failure degrades to no-subscription + default limits and still answers 200 | `401 {error:'Unauthorized'}` | `src/routes/api/me/subscription/+server.ts:10-13`; `src/lib/server/services/accountData.ts:104-125` |

### Rules the module must keep
- The active subscription row is the one with a tier (`subscriptionTypeId IS NOT NULL`) and an unexpired window (`endDate > now` or null), newest `createdAt` first — one read seam for every plan decision — `src/lib/server/services/subscriptionService.ts:36-51` · test: `subscriptionService.test.ts` › "only reads overrides through the active-sub filter (tiered, not expired)"
- Free/default limits: 1 family, 6 members, 30 retention-view days, 90 archived days, 10 MiB attachment, 10 AI creations/month, export/import enabled — `src/lib/server/services/subscriptionService.ts:105-114,315-325` · tests: `subscriptionService.test.ts` › "returns the defaults when no active subscription row exists", "returns free tier limits"
- Row overrides apply to family limit, member limit, retention days, archived days and attachment bytes only; AI count and export/import come from the tier — `src/lib/server/services/subscriptionService.ts:121-135` · test: `subscriptionService.test.ts` › "merges overrides from the CURRENT subscription row and tier"
- Adding a family member compares the family's current member count with the **creator's** member limit (default 6 when no creator row) and refuses at/over it with `Family is full (N member limit). Upgrade to add more members.` — `src/lib/server/services/subscriptionService.ts:138-178` · tests: `subscriptionService.test.ts` › "at limit refuses add", "resolves the limit from the family creator subscription"
- Creating a family compares the user's distinct family count with `familyLimit` and refuses with `Family limit reached (N). Upgrade to create more families.` — `src/lib/server/services/subscriptionService.ts:180-206` · test: `subscriptionService.test.ts` › "reports how many families are used, so the create page can show usage"
- Viewing an archived event older than `retentionViewDays` is refused with `Event is older than your retention limit. Upgrade to view archived events.` — `src/lib/server/services/subscriptionService.ts:208-224` · tests: `subscriptionService.test.ts` › "denies viewing event older than 30 days"
- Archive access is a tier capability: `archivedRetentionDays <= 0` → `Archive view not available on your plan` — `src/lib/server/services/subscriptionService.ts:226-237`
- Uploads over `attachmentLimitBytes` are refused with `File too large. Max NMB on your plan.` (whole MiB, rounded) — `src/lib/server/services/subscriptionService.ts:240-255` · test: `subscriptionService.test.ts` › "returns size limit in error message"
- Export/import is refused when the tier flag is off: `Export/Import not available on your plan. Upgrade to access.` — `src/lib/server/services/subscriptionService.ts:422-433`
- AI usage is a per-user, per-month, per-year counter; `remaining = max(0, limit - used)`; zero remaining refuses with `AI feature limit reached (N per month). Upgrade to unlock unlimited AI.`; recording increments an existing row or inserts one, then re-reads the remaining count — `src/lib/server/services/subscriptionService.ts:331-419`
- The AI cap is checked **before** the vendor call: signed-in + cloud requested + LLM configured → `canUseAiFeature`; denial returns `429 {error:<cap.reason>}`; usage is recorded after the billed call even when the parse returns null — `src/routes/api/parse-event/+server.ts:109-124` · tests: `src/routes/api/parse-event/server.test.ts` › "refuses over-cap callers with 429 before any vendor call", "records usage even when the LLM returns nothing (the request is still billed)"
- Anonymous callers never reach the paid LLM (regex only), and `useCloud:false` skips both the cap check and the usage record — `src/routes/api/parse-event/+server.ts:85-96,109-124` · tests: `parse-event/server.test.ts` › "never calls the paid LLM for unauthenticated callers, even when configured", "skips the cap check entirely when the client opted out of cloud parsing"
- Short-window parse budget is plan-aware: paid (`tierName !== 'free'`) has none; free (including no subscription row) gets 20 per 5 minutes per client IP and, over budget, silently falls back to regex — never a 429 (#317) — `src/routes/api/parse-event/+server.ts:35-41,85-91` · tests: `parse-event/server.test.ts` › "keeps the free tier at 20 cloud parses per 5 minutes, then falls back to regex", "never short-window caps a paid tier", "treats a caller with no subscription row as free"
- Multi-event input takes the local list parse and returns `method:'regex-list'` without any LLM, cap or usage work — `src/routes/api/parse-event/+server.ts:99-105`
- `999` is the "no limit" stand-in: paid seed tiers use 999 family/member limits and 999999 AI creations, and display helpers render any limit ≥999 as `Unlimited` — `src/lib/server/seed.ts:66-103`; `src/lib/components/account/accountSubscription.ts:38-45` · test: `src/lib/components/account/accountSubscription.test.ts` › "says Unlimited rather than inventing a ceiling"
- Base prices are monthly 9, annual 90, lifetime 150 — `src/lib/server/services/checkoutService.ts:22-26`
- Checkout price: family discount applies to annual and lifetime, lifetime discount to lifetime only; percentages sum and cap at 100; final = `max(0, base - round2(base × pct))`; each line item needs a matching enabled `discounts` row — `src/lib/server/services/checkoutService.ts:28-103`
- Family discount: any user holding ≥4 `familyMembers` rows is eligible for 40% — `src/lib/server/services/discountService.ts:19-33`
- Lifetime discount: eligible only when an enabled lifetime `discounts` row exists; a user who already holds that discount gets 20%, otherwise the row's `discountRate` — `src/lib/server/services/discountService.ts:36-79`
- `applyDiscount` is idempotent per user+discount and answers `{applied:false, message:'Discount already applied'}` or `{applied:true, message:'Discount applied successfully'}` — `src/lib/server/services/discountService.ts:130-147`
- Checkout is a stub: the purchase action validates plan + price then always reports `Checkout is not yet available. Join the waitlist to get early access.` — `src/routes/(marketing)/checkout/+page.server.ts:53-73`
- Only enabled tiers and discounts are listed — `src/lib/server/services/subscriptionService.ts:327-329`; `src/lib/server/services/discountService.ts:126-128`
- The seed defines six idempotent tiers (free, cal-master monthly/annual, family-master monthly/annual/lifetime) and two discounts (lifetime 20%, family-member 40%) — `src/lib/server/seed.ts:11-142`

### Page and UI behaviour worth keeping
- `/pricing` renders three marketing cards — Free $0, Family $9/mo, Lifetime $150 one-time — each with a feature list and CTA, plus a four-question FAQ and a contact link — `src/routes/(marketing)/pricing/+page.svelte:4-48,88-110`
- `/checkout` redirects anonymous visitors 302 to `/login?redirect=/checkout`, defaults `?plan` to monthly when absent/invalid, and shows the selected plan, its price, applied and eligible discounts, and a base/discount/total breakdown — `src/routes/(marketing)/checkout/+page.server.ts:14-47`; `src/routes/(marketing)/checkout/+page.svelte:21-120`
- The checkout CTA is disabled and reads "Coming Soon" with the waitlist copy underneath — `src/routes/(marketing)/checkout/+page.svelte:90-99`
- A signed-in pricing visit logs a `pricing_view` event — `src/routes/(marketing)/pricing/+page.server.ts:12-15`; `src/lib/server/services/analyticsService.ts:45-47`
- `PlanTypeSelector` is a two-card radio group (Cal Master / Family Master) that shows "You're on the Free plan" with a `/pricing` link when `currentPlan === 'free'` — `src/lib/components/PlanTypeSelector.svelte:2-6,44,77,82-86`

### Probably accidental (candidates to drop, owner to confirm)
- The pricing page never reads its load data, so `showDiscountedPrices`/`displayPrice` are computed and discarded; discounted prices are unreachable — `src/routes/(marketing)/pricing/+page.server.ts:61-76` vs `src/routes/(marketing)/pricing/+page.svelte:4-48` — why: dead server work
- `PlanTypeSelector` hardcodes `$5/month or $48/year` and `$9/month or $90/year`, contradicting `BASE_PRICES` (9/90/150), and has 0 importers — `src/lib/components/PlanTypeSelector.svelte:44,77` — why: dead, wrong prices
- The pricing card advertises "Up to 5 family members" while the free tier's `memberLimit` is 6 — `src/routes/(marketing)/pricing/+page.svelte:12`; `src/lib/server/seed.ts:11-24` — why: copy/limit drift
- `calculateFamilyMemberDiscount` counts the user's family-membership rows (4 different families qualify) instead of members of one family, and its `>= 4` threshold disagrees with the "5+ members" description — `src/lib/server/services/discountService.ts:19-33`; `src/lib/server/services/checkoutService.ts:159` — why: wrong dimension and off-by-one
- `getPlanPricing(_planType)` ignores its argument and always returns all three plans — `src/lib/server/services/checkoutService.ts:186-197` — why: misleading signature
- `getUserSubscriptionLimits` duplicates the default-limits literal instead of calling `getDefaultLimits()` — `src/lib/server/services/subscriptionService.ts:105-114` vs `:315-325` — why: drift risk
- The purchase action trusts the client-posted `finalPrice` — `src/routes/(marketing)/checkout/+page.server.ts:61-64` — why: never charge a client-supplied amount
- `getDiscountByType` scans the first 10 enabled discounts and picks by flag, ignoring the row's own rate/name — `src/lib/server/services/checkoutService.ts:87-101` — why: arbitrary when several are enabled
- `seed.ts` also writes five random test ad events, an out-of-domain side effect of seeding billing — `src/lib/server/seed.ts:144-208` — why: demo data in a plan seeder
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
# billing: 0% ported

legacy source files left (6/6, 1153 LOC):
  - src/lib/components/PlanTypeSelector.svelte (90 LOC, ui) importers: 0
  - src/lib/server/seed.ts (216 LOC, server) importers: 0
  - src/lib/server/services/analyticsService.ts (64 LOC, server) importers: 1
  - src/lib/server/services/checkoutService.ts (199 LOC, server) importers: 3
  - src/lib/server/services/discountService.ts (148 LOC, server) importers: 1
  - src/lib/server/services/subscriptionService.ts (436 LOC, server) importers: 9

route files not yet wiring-only (5/5):
  - src/routes/(marketing)/checkout/+page.server.ts  /checkout
  - src/routes/(marketing)/checkout/+page.svelte  /checkout
  - src/routes/(marketing)/pricing/+page.server.ts  /pricing
  - src/routes/(marketing)/pricing/+page.svelte  /pricing
  - src/routes/api/me/subscription/+server.ts  /api/me/subscription

legacy test files left (2/2) — reference only, kinds explained in docs/architecture/testing.md:
  - src/lib/server/services/discountService.test.ts [stub-db, 4 tests]
  - src/lib/server/services/subscriptionService.test.ts [stub-db, 18 tests]
```
<!-- census:end -->
