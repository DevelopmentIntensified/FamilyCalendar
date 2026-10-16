# 190 — Child accounts without age gate or consent flow; policy silent
Status: in-progress
Source: production-readiness governance audit, 2026-10-16. Sharpens #189 (children's data raises every GDPR/CCPA obligation).
## Done

- Consent attestation shipped (option A, minimal step): `childConsentRecords` append-only table (088b pattern) — `sql/migrations/017_create_child_consent_records.sql` + schema mirror; **hand-run on Neon both branches; do NOT rely on drizzle-kit push for prod**. Child-add route (`members/add/child/+server.ts`) server-side required `consentAcknowledged` (400 without it, nothing created); membership + consent row written in one tx. `MemberChildTab.svelte` required checkbox with honest copy; privacy page "Children's data" section added.
- Tests red→green (4 red against the no-gate/no-tx stub → 5/5; tabs suite 12/12 incl. "no fetch without the acknowledgment").
- Still open (counsel/owner decisions, do not build unilaterally): (1) verified/email parental-consent flow — this is self-attested only; (2) age gate at child creation; (3) whether admin siblings may attest or parent-only.
- Child members are real user rows with unique emails (`family/[familyId]/members/add/child/+server.ts:12-21`); parents create them with arbitrary emails behind only a logged-in gate (`:22-91`) — no age gate, no verified parental-consent flow.
- No child-data handling in the privacy policy language reviewed.
## Needs doing
- Age gate + parental-consent record, or counsel-backed waive; policy section on child data. Owner/legal decision.

## First real step — option A, minimal (2026-10-16)
Parental-consent **attestation** at child creation, not a verified flow:

- `childConsentRecords` (schema.ts, shape of 088b's `adConsentRecords`: append-only,
  no unique key on childUserId, cascades on user delete). DDL in
  `sql/migrations/017_create_child_consent_records.sql` — **must also be applied to
  production by hand (Neon, both branches), 088 precedent; do not rely on push.**
- The child-create action requires `consentAcknowledged === true` server-side and,
  on success, writes the membership row and the consent record
  (`source='child-create'`, parent actor, family, timestamp) in one transaction.
- Privacy policy gained a "Children's data" section: parents create and control
  child accounts, what is stored, consents kept as records, removal available.
- **Counsel decision still owed:** this is a self-attested checkbox, NOT an
  email-verified parental-consent flow (that build was explicitly out of scope
  for this step). An age gate was also not added. Both remain open until
  counsel rulings. `adConsentRecords` serve-time behavior untouched.
