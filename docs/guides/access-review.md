# Quarterly Access Review

Run at the start of each quarter. For each system, list every principal with access and confirm it is still needed. Record the review as a filled copy of this file under `docs/guides/access-review-YYYYQn.md`. Any row marked "remove" must be actioned before the next review; anything unactionable gets an issue in `docs/issues/`.

## Checklist — what to enumerate

1. **Neon** — all branches (including `test`/preview branches) and database roles; confirm no stale branches from removed work, no shared passwords, least-privilege roles.
2. **Vercel** — team members and their roles; deployment protection settings unchanged.
3. **Resend** — account members and API keys (names + last-used, not values); sending domains verified.
4. **GitHub** — repository collaborators and their permission level; outside collaborators; branch protection on `test`/master.
5. **Domain registrar / DNS** — registrar account owner, who can change nameservers and DNS records; DNS records match expectations (no dangling records pointing at removed hosts).

## Template

| System | Principal | Role / scope | Needed? | Action | Notes |
|---|---|---|---|---|---|
| Neon | `main` branch, role `production_owner` | Full DB access, production | Yes | keep | Owner |
| Neon | `test` branch, role `app_test` | App-level access, test data | Yes | keep | Auto-deploy target |
| Neon | `old-preview` branch | Preview data | No | **remove** | Feature shipped 2026-08 |
| Vercel | `[PLACEHOLDER — Vercel team membership visible only to owner]` | — | — | — | — |
| Resend | `[PLACEHOLDER — API key inventory visible only to owner]` | — | — | — | — |
| GitHub | `[PLACEHOLDER — collaborator list visible only to owner]` | — | — | — | — |
| Registrar / DNS | `[PLACEHOLDER — registrar/DNS access visible only to owner]` | — | — | — | — |

## Reviewed

- Date: YYYY-MM-DD
- Reviewed by: [name]
- Follow-up issues: [issue numbers or "none"]
