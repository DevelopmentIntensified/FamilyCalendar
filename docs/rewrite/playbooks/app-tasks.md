# Playbook: app tasks (APP-01 … APP-07)

These run after every domain and screen is `done`. They retire the last legacy pieces and prepare cutover.

## app-01

**APP-01: cron cleanup and health check.**

1. Write goldens first, for `GET` and `POST /api/cron/cleanup` and for `GET /api/health`:
   - 401 without the secret;
   - with the secret, the response keys: `success`, `deleted`, `scanned`, `cutoff`, `notificationsPruned`, `phrasesPruned`, `bugReportsPruned`, `adEventsPruned`.
2. Create `src/lib/app/retention.server.ts` with `runRetention(ctx)`. It calls each module's prune service with today's windows:

   | what | kept for |
   |---|---|
   | Anonymous Accounts inactive | 90 days |
   | read notifications | 90 days |
   | resolved phrases and bug reports | 180 days |
   | ad events | 90 days |
   | expired claim tokens | deleted |

   "Now" comes from `ctx.clock`.
3. Create the endpoints in `src/lib/app/appRoutes.server.ts`:
   - cleanup: `endpoint({ auth: 'cron', … })`, wired to both GET and POST;
   - health: `endpoint({ auth: 'public' })`, a database ping bounded to 1 s that leaks no detail.
4. Rewire both route files and add `app.retention.db.test.ts`, which seeds old and new rows per table and asserts exactly the old ones are gone.

## app-02

**APP-02: limiter swap.** When `git grep -n "server/utils/rateLimit" -- src` lists only `src/lib/app/appCtx.server.ts`:

1. Switch `limiter` to `createMemoryRateLimiter(systemClock)`.
2. Delete `src/lib/server/utils/rateLimit.ts` and its test.
3. Update the bridge comment in appCtx.

## app-03

**APP-03: session pipeline into app.**

1. Move the logic of `sessionHandle`, `apiOriginCheck` and `securityHeaders` out of `src/hooks.server.ts`:
   - the decision functions go into identity/access services (`resolveBearer`, `resolveSessionCookie`, `shouldCreateAnonymousAccount`);
   - the hook composition goes into `src/lib/app/requestPipeline.server.ts`.
2. Keep the hand-written composition: no `sequence()`. Keep the order (security headers → origin check → session), the anonymous-account-only-on-document-navigation rule, the admin gate before the anonymous fallback, and the hourly `lastActiveAt` throttle.
3. `src/hooks.server.ts` becomes wiring: `export const handle = appHandle; export const handleError = appHandleError;`.
4. Write `src/lib/app/app.requestPipeline.db.test.ts` covering every rule above. The legacy `src/hooks.server.test.ts` is the reference: it pins Bearer-only-on-/api, anonymous creation only on document navigations, the blank-cookie cascade, the admin redirect and handleError filing. Delete the legacy test afterwards.

## app-04

**APP-04: e2e on v2.**

1. `e2e/testUtils.ts` and the specs import legacy server code (`npm run census` counts them). Rewrite the fixtures to use `connectDb` plus identity/access services and fixtures from their public entries.
2. Run Playwright against a local build with the Docker DB: `npm run build:safe && npx playwright test`.
3. Fix only the test helpers. A failing journey is a bug in the port; open it against the module.

## app-05

**APP-05: delete legacy.** When `npm run census` shows 0 legacy source files everywhere:

1. `git rm -r` the empty legacy folders, `vitest-setup-server.ts` and `src/lib/server/db/testHarness.ts`.
2. In `vite.config.ts`, delete the `client` and `server` projects. This task is the one place allowed to edit `vite.config.ts`.
3. Point `test:unit` in package.json at `vitest`.
4. Run `npm run typecheck -- --ratchet` (the baseline should reach 0).
5. Keep `LEGACY_PREFIXES` in the registry so the folders can't come back.

## app-06

**APP-06: docs pass.**

- Every module README passes D1/D2, and its Invariants name the tests that pin them.
- Update `docs/architecture/README.md` "Where things stand" to say it is done.
- In AGENTS.md, replace the rewrite routing line with "architecture".
- Run `npm run docs:gen` and `npm run docs:check`.

## app-07

**APP-07: cutover (owner).** Follow [plan.md › Cutover](../plan.md#cutover). The agent prepares:

- a summary (census, ledger, test counts, carry-over status);
- a final `git merge origin/test` with `npm run gate:push` and Playwright green.

Then it **stops**. The owner merges.
