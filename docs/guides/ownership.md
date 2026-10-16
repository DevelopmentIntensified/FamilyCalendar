# Ownership

One page recording who owns each domain, account, and repo. Keep current; update on any transfer. Values marked `[PLACEHOLDER]` are known only to the owner.

## Domains

| Domain | Registrar | Owner | Expiry |
|---|---|---|---|
| familyplanz.com | [PLACEHOLDER] | [PLACEHOLDER] | [PLACEHOLDER] |

## Accounts / services

| Service | Purpose | Owner | Recovery |
|---|---|---|---|
| Neon (database) | App database, branches | [PLACEHOLDER] | [PLACEHOLDER] |
| Vercel (hosting) | Web app deploys | [PLACEHOLDER] | [PLACEHOLDER] |
| Resend (email) | Transactional email | [PLACEHOLDER] | [PLACEHOLDER] |
| Domain registrar | DNS | [PLACEHOLDER] | [PLACEHOLDER] |

## Repositories

| Repo | Host | Admin/owner | Visibility |
|---|---|---|---|
| familyCalendar | GitHub | [PLACEHOLDER] | [PLACEHOLDER] |

## Committer reality and PR-review rule

The project currently has a **single committer**: one person writes, reviews, and deploys all changes. This is recorded deliberately, because it changes automatically when it stops being true.

**Rule (from AGENTS.md workflow):** when a **second committer** is added, the single-committer workflow ends — from that point, no change merges or deploys to `test`/production without a PR reviewed and approved by someone other than the author. Branch protection on `test` and master must be updated to enforce it on the day the second committer is added, not later.

Until then, the compensating controls are: `npm run build` before every push, auto-deploy only via the `test` branch, and master gated behind `test` (issues #130/#143).
