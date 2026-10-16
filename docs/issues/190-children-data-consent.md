# 190 — Child accounts without age gate or consent flow; policy silent
Status: open
Source: production-readiness governance audit, 2026-10-16. Sharpens #189 (children's data raises every GDPR/CCPA obligation).
## Done
- Child members are real user rows with unique emails (`family/[familyId]/members/add/child/+server.ts:12-21`); parents create them with arbitrary emails behind only a logged-in gate (`:22-91`) — no age gate, no verified parental-consent flow.
- No child-data handling in the privacy policy language reviewed.
## Needs doing
- Age gate + parental-consent record, or counsel-backed waive; policy section on child data. Owner/legal decision.
