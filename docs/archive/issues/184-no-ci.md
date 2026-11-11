# 184 — No CI — nothing gates deploys
Status: done (out-of-date/moot — see note)
Source: production-readiness operations audit, 2026-10-16. Before-money blocker.
## Done
- No `.github/` workflows at all; deploys are manual local `vercel deploy` runs, so the 3546-test vitest suite + Playwright e2e gate nothing except a manual `npm run build` (`scripts/deploy.mjs:104`); the worker is invisible on Vercel, not `vercel.json:1-7`.
- Advisories #156-161 catalogued but unfixed and unscanned — no SCA/vuln scanning exists without a pipeline.
## Needs doing
- Workflow running check + unit + build + e2e per push to test; SCA scan in-pipeline; deploy only on green.

## Done 2026-10-22

- 2026-10-22 closed as waiver: owner decision recorded — CI stays local-gate (b65840a removed the workflow; STATUS.md records the decision). Not a task to add CI; premise moot by ruling.
