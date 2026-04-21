# Family Master Planning Document (Test Branch)

Version: 0.1
Last updated: 2026-04-17

Executive summary
- Rename pricing tier to "Family Master" and implement tiered limits, ads in calendars, waitlist/marketing page, and two hidden discounts.
- All assets (images/docs) stored in VerceI Blob as specified.
- Deliver a phased rollout with gated features, migration paths for existing users, and clear upgrade prompts.

Goals and scope
- Introduce Family Master as the paid tier replacing the prior Pro naming.
- Free tier limits: 1 family, 1 month viewable retention, 3 months archived, 10 MB attachments.
- Pro-equivalent benefits (under new name) and two hidden discounts: 40% off for 12 months; 20% lifetime off.
- Ads integrated into calendar events (passive and active modes).
- Marketing page and newsletter waitlist for email collection.
- Assets stored in VerceI Blob; support image/docs hosting, versioning, and access control.

Tier names and scope
- Family Master (selected name for paid tier)
- Free (existing) with clarified quotas
- Lifetime (existing concept) should interact with discounts

Phase plan (high level)
- Phase 0: Finalize tier naming, policy documents, and data models.
- Phase 1: Extend data model to support quotas, discounts, ads, and waitlist data.
- Phase 2: Implement Free tier enforcement (family cap, retention, storage).
- Phase 3: Implement discounts (40% 12-month, 20% lifetime) and integrate with checkout.
- Phase 4: Ads pilot (passive and active) within calendar, plus consent flows.
- Phase 5: Marketing pages (pricing, waitlist) and newsletter capture flow.
- Phase 6: Observability and KPI dashboards; iterate based on data.

Data model considerations (summary)
- Extend subscriptions: add tierName/displayName, quotas (familyLimit, retentionViewDays, retentionArchiveDays, attachmentLimitBytes).
- Add discounts: fields to track eligibility, discount rates, duration, applicability to plan types (monthly, annual, lifetime).
- Ads: AdEvent model with sponsor, message, CTA, deadline, targetPlan, impressions, clicks, conversions, expiry.
- Waitlist/marketing: tables for waitlist entries, preferences, consent, region.

Ads strategy (summary)
- Passive ads: calendar-integrated sponsor events, banners in UI, and digest cards.
- Active ads: sponsored reminders or countdowns tied to deadlines; opt-in controls.
- Privacy: opt-in, non-personalized by default; transparent consent.

Marketing and onboarding
- Marketing page with regional pricing considerations and FAQs.
- Newsletter waitlist: single email capture form with - optionally - double opt-in.
- Onboarding: upgrade prompts, feature highlights, and account/pricing guidance.

KPIs and success criteria
- MRR/ARR, upgrades-to-Free churn, waitlist signups, ad revenue, upgrade conversion rate, retention by tier.
- Ads: impressions, CTR, downstream conversions to upgrades.
- Waitlist: signups and conversion to paid.

Risks and mitigations
- Ads disrupt user experience: opt-in, frequency controls, non-intrusive placements.
- Data migration risk: blue/green rollout, backups, rollback plan.
- Compliance: consent management, privacy policy updates.

Ownership and governance
- Product: owner, Marketing: owner, Engineering: lead, Legal/Privacy: advisor.
- Decision records and acceptance criteria per phase to be defined in a companion doc.

Appendix
- Asset storage conventions (VerceI Blob): naming, folders, access control, and versioning.
- Glossary of terms: Family Master, waitlist, ads, retention, archiving.

Next steps
- Await confirmation on naming and policy details to finalize Phase 0 artifacts.
- Upon confirmation, generate Phase 0 tasks and owner assignments.
