# Family Master Planning Document (Test Branch)

Version: 0.2
Last updated: 2026-04-21

## Executive Summary
- Rename pricing tier to "Family Master" and implement tiered limits, ads in calendars, waitlist/marketing page, and two hidden discounts.
- All assets (images/docs) stored in Vercel Blob as specified.
- Deliver a phased rollout with gated features, migration paths for existing users, and clear upgrade prompts.

## Goals and Scope
- Introduce Family Master as the paid tier replacing the prior Pro naming.
- Free tier limits: 1 family, 1 month viewable retention, 3 months archived, 10 MB attachments, 10 AI event creations/month.
- Pro-equivalent benefits (under new name) and two hidden discounts: 40% off for 12 months (4+ family members); 20% lifetime off.
- Ads integrated into calendar events (passive and active modes).
- Marketing page and newsletter waitlist for email collection.
- Assets stored in Vercel Blob; support image/docs hosting, versioning, and access control.

## Tier Names and Scope
- Family Master (paid tier) - $9/mo or $90/yr
- Cal Master (individual) - $5/mo or $48/yr
- Free (existing) with clarified quotas
- Lifetime (existing concept) - $299 one-time

## Phase Status

### Phase 0: Finalize Tier Naming, Policy, Data Model ✅
- [x] Tier naming finalized: Cal Master (individual), Family Master (family)
- [x] Data model extended for quotas, discounts, ads, waitlist
- [x] Schema updates in `src/lib/server/db/schema.ts`

### Phase 1: Extend Data Model ✅
- [x] Extended subscriptionTypes with quotas (maxFamilies, maxFamilyMembers, retention, storage, AI limits)
- [x] Created discounts, userDiscounts tables for discount tracking
- [x] Created adEvents, userAdConsent tables for ads
- [x] Created waitlist table for email collection
- [x] Created aiUsageTracking table for AI usage limits
- [x] Added role column to familyMembers
- [x] Added ads columns to userSettings (showAdsAsEvents, showAdMarkers, personalizedAds)

### Phase 2: Free Tier Enforcement ✅
- [x] Family limit enforcement (1 family for free)
- [x] Retention limits (1 month view, 3 months archived)
- [x] Attachment size limit (10MB)
- [x] AI usage limits (10 events/month)
- [x] Export/Import enabled flag

### Phase 3: Discounts and Checkout ✅
- [x] 40% discount for 12-month plan with 4+ family members (hidden)
- [x] 20% lifetime discount (hidden)
- [x] discountService with calculation logic
- [x] checkoutService integration
- [x] Checkout page UI

### Phase 4: Ads Pilot
- [ ] Passive ads: calendar-integrated sponsor events
- [ ] Banners in UI
- [ ] Active ads: sponsored reminders
- [x] Consent flows (userAdConsent table)
- [x] Ad preferences in settings (disabled until DB migration runs)

### Phase 5: Marketing Pages ✅
- [x] Pricing page (/pricing) with Cal Master / Family Master selector
- [x] Waitlist page (/waitlist) for email capture
- [x] Checkout page (/checkout)

### Phase 6: Observability
- [ ] KPI dashboards
- [ ] Upgrade conversion tracking
- [ ] Ad performance metrics

## Data Model

### Tables Created/Modified
- `subscriptionTypes` - Extended with quotas
- `activeSubscriptions` - Subscription tracking
- `discounts` - Discount codes and rates
- `userDiscounts` - User-discount associations
- `adEvents` - Ad impressions
- `userAdConsent` - Consent preferences
- `waitlist` - Email waitlist
- `aiUsageTracking` - AI usage per period
- `familyMembers` - Added role column
- `userSettings` - Added ads columns

## Services Created
- `subscriptionService` - Tier limits, AI usage tracking
- `discountService` - Discount calculations
- `checkoutService` - Checkout flow
- `adService` - Ad injection/tracking
- `blobService` - Vercel Blob storage
- `emailService` - Email sending

## UI Components
- `PlanTypeSelector.svelte` - Cal/Family Master selector
- Pricing page with tier comparison
- Waitlist signup form
- Checkout with Stripe integration

## Hidden Discounts
| Discount | Condition | Amount |
|----------|-----------|--------|
| Family Size | 4+ family members | 40% off |
| Lifetime | Any user (secret) | 20% off |

## Pricing
| Plan | Monthly | Annual |
|------|---------|--------|
| Cal Master (individual) | $5 | $48 |
| Family Master (family) | $9 | $90 |
| Lifetime | - | $299 |

## Free Tier Limits
- 1 family max
- 1 month viewable retention
- 3 months archived
- 10 MB attachments
- 10 AI event creations/month
- No export/import

## Risks and Mitigations
- Ads disrupt user experience: opt-in, frequency controls, non-intrusive placements
- Data migration risk: backups, rollback plan
- Compliance: consent management, privacy policy updates

## Next Steps
- Run DB migration on Vercel preview/prod
- Test pricing page with discounts
- Test waitlist signup
- Implement ad event injection in calendar
- Add KPI tracking
