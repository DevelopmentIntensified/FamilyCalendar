# Family Master Planning – Questions (Test Branch)

1. Tier naming: Family Master chosen. Any alternate branding for marketing alongside this name?
2. Free tier scope: is the 1 family limit global per account or per calendar/workspace?
3. Free retention: should 1 month be fully visible in UI/search with older events hidden by default?
4. Archived data: should 3 months archived be retrievable (upgrade/special request) or always stored but not surfaced?
5. Archived exposure: how should admins assist users needing access to archived data (support tools, exports)?
6. Attachments quota: is 10 MB per user, per family, or per account? how tracked? 
7. Storage backend: continue using VerceI Blob, or allow alternate (S3) with migrations?
8. Downgrades: what happens to data if downgrading to Free (attachments, retention, family limits)?
9. Migration path: one-time migration vs staged rollout to Family Master for existing users?
10. Discount eligibility: define “more than 5 in your family” (active members vs invites vs real-time vs snapshot)?
11. 40% discount (12 months): is this 40% off each month for 12 months or a 12-month promo? applicable to monthly/annual/both?
12. 20% discount (lifetime): one-time lifetime discount or ongoing? impact on future price increases?
13. Discount stacking: can discounts stack with other promos or are they exclusive?
14. Eligibility signals: real-time recalculation as members change or fixed cadence?
15. Ads in calendar: passive vs active ads—how to distinguish in UI?
16. AdEvent model: which fields (sponsor, message, CTA, deadline, targetPlan, impressions, clicks, conversions, expiry)?
17. Ad delivery: ads auto-injected as events or banners/cards in a calendar/ad pane?
18. Ad consent: default opt-in or opt-out? can users disable ads? default?
19. Ad privacy: what data shared with advertisers (anonymized cohorts vs user-level)? consent required for targeting?
20. Advertiser portal: self-serve or managed program? moderation rules?
21. Ad revenue: revenue-share model (fixed packs vs auction)?
22. Ad moderation: who approves content, escalation paths for violations?
23. Marketing pricing: region-aware pricing from day one (currency/tax)?
24. Waitlist form: fields besides email (name, region, role, company)? double opt-in?
25. Welcome emails: auto-send on signup/waitlist? content?
26. Marketing assets: which images/docs reside in VerceI Blob? naming/versioning/access?
27. Regional localization: multi-language pricing/waitlist support?
28. Tax handling: VAT/GST for regional pricing; invoicing responsibilities?
29. Billing systems: Stripe setup—new products for Family Master and lifetime variants? proration, refunds?
30. Data model changes: new tables/fields (tiers, quotas, ads, waitlist, campaigns)? migration plan?
31. Quotas UI: how to display quotas (dashboards, upgrade dialogs, in-event notices)?
32. Feature gating: which features belong to Family Master vs Free (attachments, retention, family count, ads)?
33. Onboarding: ideal onboarding flow for Family Master (checklist, tour, upgrade prompts)?
34. Compliance: privacy policies, ads, waitlist, and data retention policy updates?
35. Analytics: key KPIs (MRR, upgrade rate, churn, ad revenue per user, waitlist conversions)?
36. Security: protecting payment/ad data (tokenization, PCI scope, access controls)?
37. Accessibility: pricing, signup, waitlist accessible (keyboard, screen readers, contrast)?
38. Localization of content: pricing copy localization approach (currency, tone, tax language)?
39. Rollout strategy: phased with feature flags or big-bang? rollback plan?
40. Customer support: FAQs and in-app help for pricing, ads, waitlist, upgrades?
41. API surface: endpoints for pricing, upgrades, waitlist, ads? versioning plan?
42. Data retention: how long waitlist, ad engagement data, and marketing analytics stored?
43. Migration risk: top risks (data loss, duplication, confusion) and mitigations?
44. Backwards compatibility: how to handle legacy users during Family Master rollout?
45. Success criteria: concrete, testable acceptance criteria per phase (quota enforcement, discounts, ads, waitlist)?

Notes
- Answers to these questions will drive Phase 0 artifacts. Please answer in the Questions doc, and I will update the Planning doc accordingly.
