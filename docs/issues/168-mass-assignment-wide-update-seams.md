# 168 — Mass-assignment seams accept roles/email/verified/passwordHash

Status: open

Source: security audit (issue 136), 2026-10-15. Rank 12/16 — NOT reachable today (all call sites pass safe subsets); hardening.

## Done

- `src/lib/server/db/actions/users.ts` — `updateUser(id, Partial<Omit<User,'id'>>)` accepts `roles`, `email`, `emailVerified`, `passwordHash`.
- `userSettings.ts` — `updateUserSettings` ditto for its row. All current callers pass safe subsets (verified this pass) — one future caller can mass-assign privilege.

## Needs doing

- Narrow both seams to explicit field unions (each caller declares what it may write). Refactor + call-site updates; no behaviour change. No fork.
