# 185 — Infra by memory; deploys from dirty branches; no rollback path
Status: open
Source: production-readiness operations audit, 2026-10-16.
## Done
- Infra = `vercel.json` (crons only) + manual CLI; DB push is imperative env-file scripts (`db:push:preview`/`:prod`, `package.json:7-8`, optional via `DEPLOY_DB_PUSH=1` `deploy.mjs:110`); node/static/vercel adapters coexist (`package.json:47-49`). Neon `main`/`preview-test` branches exist but parity lives in memory/env files, not versioned infra.
- `deploy.mjs:16-18` ships whatever branch is checked out including uncommitted work; no rollback path (only re-deploying an old URL from CLI history). Vercel rolls are immutable/atomic (zero-downtime inherited) — rollback is the missing half.
## Needs doing
- Version-controlled env parity; deploy pins a commit and refuses a dirty tree; scripted one-click rollback.
