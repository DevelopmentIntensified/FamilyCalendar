# billing

**domain** — Plans, subscriptions, plan limits (family size, archive), discounts, checkout stub, AI spend cap and usage.

Domain words come from [CONTEXT.md](../../../../CONTEXT.md); use them exactly. Architecture rules: [docs/architecture/rules.md](../../../../docs/architecture/rules.md).

## Purpose

- Owns: the **plan policy** — one answer for what a person's plan allows (family count, members per family, archive view days, archived retention, attachment size, AI creations per month, export/import) — resolved from the one active subscription row and its tier.
- Owns: the **AI allowance** — the per-user, per-month creations counter behind the vendor spend cap, and whether a caller counts as free (short-window parse budget) or paid.
- Owns: **discounts** (family-size, lifetime), the **checkout quote** and the checkout stub, and the plan card's read model (`GET /api/me/subscription`).
- Does not own: families, Family Members and who counts as a family creator (`family` — billing is handed the counts); archive and retention *enforcement* on events (`calendar`); attachment bytes (`tasks`/`calendar`); the LLM call, its regex fallback and the short-window limiter (`parsing`); pricing page copy (`marketing`).

## Files

| file | role | what it does — and why it exists | tested by |
|---|---|---|---|
| [index.ts](index.ts) | entry | Public isomorphic interface: contract types, plan/limit/discount rules, client api. | — |
| [index.server.ts](index.server.ts) | entry | Public server interface: plan policy, AI allowance, checkout quote and the endpoint handler. | — |
| [ui/index.ts](ui/index.ts) | entry | Public plan-card components (S7). | — |
| [billing.http.db.test.ts](billing.http.db.test.ts) | test | Golden contract for `GET /api/me/subscription`: the only `/api` route this module owns. Runs committed-mode against the legacy handler, so the same file proves the port changed nothing. | itself |

## Public interface

Designed now; the files that carry these exports arrive in S3–S6 (see the sheet's Plan). Every export passes the deletion test: moving its body into each caller would copy a query, a policy literal or a user-facing message.

- `index.ts`:
  - `PlanType`, `PlanLimits`, `SubscriptionSummary` (contract types) — the plan vocabulary and the plan card's wire model.
  - `FREE_PLAN_LIMITS` — the free policy in one literal (1 family, 6 members, 30 view days, 90 archived days, 10 MiB, 10 AI creations/month, export/import on).
  - `resolvePlanLimits(row, tier)` — one merge rule: row overrides beat the tier for family/member/retention/archived/attachment; AI count and export/import always come from the tier.
  - `memberLimitRefusal(limits, memberCount)`, `familyCreationRefusal(limits, familiesUsed)`, `retentionRefusal(limits, eventDate, now)`, `archiveRefusal(limits)`, `attachmentRefusal(limits, fileSizeBytes)`, `exportImportRefusal(limits)` — the plan refusals, message included, so no caller can invent a second wording. Callers own the row counts: billing may not read `familyMembers`/`events` (rank + table ownership).
  - `isUnlimitedLimit(limit)` — the `999` "no limit" stand-in, read in one place.
  - `aiAllowance(used, limit)` and `aiLimitRefusal(allowance)` — `remaining = max(0, limit - used)` and its one refusal message.
  - `isPaidTier(tierName)` — the free/paid split the short-window parse budget turns on.
  - `PLAN_PRICES`, `planPricing()`, `checkoutQuote({ plan, basePrice, familyRate, lifetimeRate })`, `familyDiscountRate(membershipCount)`, `lifetimeDiscountRate(configuredRate, holdsLifetimeDiscount)` — base prices, percentages summed and capped at 100, rounded money, never negative.
  - `formatPlanLimit(used, limit)` — "N of M" / "Unlimited".
  - `fetchSubscriptionSummary()` — browser client for the plan card.
- `index.server.ts`:
  - `getSubscriptionSummary(ctx, actor)` — the plan card's read model: active row + tier, limits, this month's AI usage, plan prices; a read failure degrades to "no subscription" + free defaults and still answers.
  - `getPlanLimits(ctx, actor)` — the one policy read other modules use before they allow or refuse an action.
  - `isPaidCaller(ctx, actor)` — paid (any non-`free` active tier) vs free (including no row), for the parsing budget.
  - `assertAiAvailable(ctx, actor)` — throws `tooMany` with the cap message before any vendor call; `recordAiCreation(ctx, actor)` counts one billed creation and answers the remaining count.
  - `getCheckoutQuote(ctx, actor, input)` — base price, applied discounts and total for a plan, from billing's own discount tables plus the family membership count the caller passes.
  - `listEligibleDiscounts(ctx, actor, input)` — the discounts this person qualifies for, with the legacy descriptions.
  - `applyUserDiscount(ctx, actor, discountId)` — idempotent per user+discount, with the legacy result messages.
  - `recordPlanView(ctx, actor, planType)` — the `pricing_view` event, written through `ctx.log` (legacy `logEvent` dies).
  - `ensureBillingDefaults(ctx)` — idempotent tiers and discounts (the legacy seed, without its ad-event side effect).
  - `getSubscriptionEndpoint` — `GET /api/me/subscription`.
- `ui/index.ts`: `PlanCard` — the account plan card (tier name, period/renewal line, usage rows); (S7).

## How to test

- Whole module: `npm run test:mod -- billing` (add `--legacy` while legacy tests remain).
- Pure rules: `*.rules.test.ts`, plain tables of input → expected output, no setup.
- Database + services: `*.db.test.ts` using `rollbackTest` and `testCtx({ db })` (needs Postgres: `docker start familycalendar-db`).
- HTTP contract: `billing.http.db.test.ts` pins status + body of `GET /api/me/subscription` (golden tests, committed mode).
- UI: `ui/*.svelte.test.ts` render with props; state classes are tested without a DOM.
- Fixtures: `billing.fixtures.server.ts` (tier, subscription row, discount, usage builders).
- The goldens read the real clock where the legacy service does (the AI-usage month); they seed the same month and assert counts and shapes, never a date.

## Invariants

Wire rules are pinned by [billing.http.db.test.ts](billing.http.db.test.ts) today; module rules name the test that will pin them when the code lands.

| invariant | legacy evidence | pinned by |
|---|---|---|
| `GET /api/me/subscription` answers `{subscription:{tier,subscription},planLimits,aiUsage,planPricing}` for a signed-in caller (session **or** `fp_` Bearer token) | `src/routes/api/me/subscription/+server.ts:10-14`, `src/lib/server/services/accountData.ts:104-125` | `billing.http.db.test.ts` › "answers the free-plan summary for a signed-in user with no subscription row", "answers the same summary for a Bearer token caller (via: \"token\")" |
| Signed out it answers `401 {"error":"Unauthorized"}` | `src/lib/server/utils/requireUser.ts:47-54` | `billing.http.db.test.ts` › "answers 401 {\"error\":\"Unauthorized\"} when signed out" |
| Any read failure degrades to no subscription + the free limits and still answers 200 | `src/lib/server/services/accountData.ts:104-125` | `billing.http.db.test.ts` › "degrades to no subscription and the free defaults when a read fails" |
| `planPricing` is always the base prices — monthly 9, annual 90, lifetime 150 — with `monthlyEquivalent = annual / 12` | `src/lib/server/services/checkoutService.ts:22-26,186-197` | `billing.http.db.test.ts` (every body), `billing.pricing.rules.test.ts` › "prices the three plans and the annual month" |
| The active subscription row is the one with a tier (`subscriptionTypeId IS NOT NULL`) and an unexpired window, newest `createdAt` first — one read seam for every plan decision | `src/lib/server/services/subscriptionService.ts:36-52` | `billing.http.db.test.ts` › "ignores an expired subscription row and falls back to the free defaults", "reads the newest active subscription row when a user holds two"; `billing.repo.db.test.ts` › "findActiveSubscription skips expired and untiered rows and takes the newest" |
| Free/default limits: 1 family, 6 members, 30 retention-view days, 90 archived days, 10 MiB attachment, 10 AI creations/month, export/import enabled | `src/lib/server/services/subscriptionService.ts:105-114,315-325` | `billing.http.db.test.ts` › "answers the free-plan summary…"; `billing.limits.rules.test.ts` › "free policy literal" |
| Row overrides apply to family limit, member limit, retention days, archived days and attachment bytes only; AI count and export/import come from the tier | `src/lib/server/services/subscriptionService.ts:123-131` | `billing.http.db.test.ts` › "reports the active tier, its overrides and the AI cap from that tier"; `billing.limits.rules.test.ts` › "row overrides win for the five overridable limits" |
| AI usage is a per-user, per-month, per-year counter; `remaining = max(0, limit - used)`; the summary reports this month's row against the tier's limit | `src/lib/server/services/subscriptionService.ts:331-359` | `billing.http.db.test.ts` › "counts this month of AI usage and never reports a negative remaining count"; `billing.ai.rules.test.ts` › "allowance never goes negative" |
| The AI cap refuses with `AI feature limit reached (N per month). Upgrade to unlock unlimited AI.` and is checked **before** the vendor call; a denial is `429 {error:<reason>}` with zero vendor spend | `src/lib/server/services/subscriptionService.ts:361-375`, `src/routes/api/parse-event/+server.ts:106-115` | `billing.service.db.test.ts` › "refuses an over-cap AI creation"; parsing's golden › "refuses over-cap callers with 429 before any vendor call" |
| A billed AI call is recorded even when the parse returns nothing, and recording increments the period row or inserts it | `src/lib/server/services/subscriptionService.ts:377-420`, `src/routes/api/parse-event/+server.ts:120-123` | `billing.service.db.test.ts` › "counts usage even when the vendor returned nothing"; parsing's golden › "records usage even when the LLM returns nothing (the request is still billed)" |
| Anonymous callers never reach the paid LLM; `useCloud:false` skips both the cap check and the usage record | `src/routes/api/parse-event/+server.ts:85-94,106-123` | parsing's golden › "never calls the paid LLM for unauthenticated callers, even when configured", "skips the cap check entirely when the client opted out of cloud parsing" |
| The short-window parse budget is plan-aware: paid (`tierName !== 'free'`) has none; free and no-row callers get 20 per 5 minutes and over budget silently fall back to regex — never a 429 | `src/routes/api/parse-event/+server.ts:33-41,85-91` | parsing's golden › "keeps the free tier at 20 cloud parses per 5 minutes, then falls back to regex", "never short-window caps a paid tier", "treats a caller with no subscription row as free" |
| Multi-event input takes the local list parse and returns `method:'regex-list'` with no LLM, cap or usage work | `src/routes/api/parse-event/+server.ts:97-104` | parsing's golden › "parses a two-event phrase locally without touching the vendor" |
| Adding a Family Member compares the members currently **in** the family with the **creator's** member limit (default 6 when the family has no creator row) and refuses at/over it with `Family is full (N member limit). Upgrade to add more members.` | `src/lib/server/services/subscriptionService.ts:134-178` | `billing.limits.rules.test.ts` › "member limit refuses at the limit, allows one below"; `billing.service.db.test.ts` › "resolves the member limit from the family creator's plan" |
| Creating a family compares the user's **distinct** family count with `familyLimit` and refuses with `Family limit reached (N). Upgrade to create more families.` | `src/lib/server/services/subscriptionService.ts:180-206` | `billing.limits.rules.test.ts` › "family creation refuses at the family limit" |
| Viewing an archived event older than `retentionViewDays` refuses with `Event is older than your retention limit. Upgrade to view archived events.` | `src/lib/server/services/subscriptionService.ts:208-224` | `billing.limits.rules.test.ts` › "retention refuses an event older than the window" |
| Archive access is a tier capability: `archivedRetentionDays <= 0` refuses with `Archive view not available on your plan` | `src/lib/server/services/subscriptionService.ts:226-238` | `billing.limits.rules.test.ts` › "archive needs a plan with archived days" |
| Uploads over `attachmentLimitBytes` refuse with `File too large. Max NMB on your plan.` (whole MiB, rounded) | `src/lib/server/services/subscriptionService.ts:240-255` | `billing.limits.rules.test.ts` › "attachment refusal prints the rounded MiB limit" |
| Export/import is refused when the tier flag is off: `Export/Import not available on your plan. Upgrade to access.` | `src/lib/server/services/subscriptionService.ts:422-435` | `billing.limits.rules.test.ts` › "export/import follows the tier flag" |
| `999` is the "no limit" stand-in: paid seed tiers use 999 family/member limits and 999999 AI creations, and display renders any limit ≥ 999 as `Unlimited` | `src/lib/server/seed.ts:59-107`, `src/lib/components/account/accountSubscription.ts:42-45` | `billing.pricing.rules.test.ts` › "999 and up reads Unlimited" |
| Only enabled tiers and enabled discounts are listed | `src/lib/server/services/subscriptionService.ts:327-329`, `src/lib/server/services/discountService.ts:126-128` | `billing.repo.db.test.ts` › "lists only enabled tiers and discounts" |
| The plan card's period line: no paid plan → `No subscription yet`; a lifetime tier (`durationMonths >= 100`) → `Lifetime access · active since <date>` and `One payment · never renews`; otherwise `Started <date> · renews <date>` | `src/lib/components/account/accountSubscription.ts:20-34,60-75` | `billing.display.rules.test.ts` (S7) › "period and renewal copy per tier shape" |
| Family discount: a user holding ≥ 4 family-membership rows is eligible for 40%, applied to annual and lifetime only | `src/lib/server/services/discountService.ts:19-34`, `src/lib/server/services/checkoutService.ts:42-58` | `billing.pricing.rules.test.ts` › "family discount is 40% from four memberships up" |
| Lifetime discount: eligible only when an enabled lifetime discount exists; a user who already holds it gets 20%, otherwise the row's `discountRate`; it applies to lifetime only | `src/lib/server/services/discountService.ts:36-79`, `src/lib/server/services/checkoutService.ts:60-70` | `billing.pricing.rules.test.ts` › "lifetime discount, held and unheld" |
| Checkout price: percentages sum, cap at 100; `final = max(0, base − round2(base × pct))`; each applied line needs a matching enabled `discounts` row | `src/lib/server/services/checkoutService.ts:28-103` | `billing.pricing.rules.test.ts` › "sums discounts, caps at 100, never goes negative" |
| `applyUserDiscount` is idempotent per user+discount and answers `{applied:false, message:'Discount already applied'}` or `{applied:true, message:'Discount applied successfully'}` | `src/lib/server/services/discountService.ts:130-147` | `billing.service.db.test.ts` › "applying the same discount twice is a no-op" |
| Checkout is a stub: the purchase action validates plan + price then always reports `Checkout is not yet available. Join the waitlist to get early access.` | `src/routes/(marketing)/checkout/+page.server.ts:53-73` | `billing.service.db.test.ts` › "the checkout stub never sells a plan" |
| `/checkout` redirects anonymous visitors to `/login?redirect=/checkout` and defaults an absent/invalid `?plan` to monthly | `src/routes/(marketing)/checkout/+page.server.ts:14-47` | S7 visual check; `billing.http.db.test.ts` does not cover pages |
| The seed defines six tiers (free, cal-master monthly/annual, family-master monthly/annual/lifetime) and two discounts (lifetime 20%, family-member 40%), idempotently | `src/lib/server/seed.ts:11-142` | `billing.service.db.test.ts` › "ensureBillingDefaults is idempotent and writes six tiers" |
| A signed-in pricing visit records a `pricing_view` event | `src/routes/(marketing)/pricing/+page.server.ts:12-15`, `src/lib/server/services/analyticsService.ts:45-47` | `billing.service.db.test.ts` › "a plan view logs one pricing_view entry" |

## Depends on

- May import: kernel + identity (public entries only).
- Owns tables: `discounts`, `userDiscounts`, `subscriptions`, `subscriptionTypes`, `aiUsageTracking`.
- Reads (join only): none — the counts billing's rules need (family members, distinct families, an event's date, attachment bytes) arrive as rule arguments from the module that owns those tables.
- Calls: nothing of its own; it takes `Ctx`/`Actor` from the caller. (Legacy `getUserSubscription` was also read by `parse-event`; the port replaces that with `isPaidCaller`.)
- Called by: `family` (member/family limits), `calendar` (archive + retention view), `tasks` (attachment size), `access`/export (export/import flag), `parsing` (paid-vs-free budget, AI cap, usage record), `alerts` (plan gating), the account screen (plan card), `marketing` (pricing + checkout pages — once marketing is ported).
