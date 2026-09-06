# 001 — Local Postgres via Docker

Status: done

## Done

- `docker-compose.yml`: postgres:16-alpine, port 5433 (5432/5434 taken on this machine), named volume `pgdata`, healthcheck; container `familycalendar-db`.
- `docker/postgres-init/02-test-db.sql`: creates `familycalendar_test` alongside the default `familycalendar` DB.
- npm scripts: `db:up` (compose up -d --wait), `db:down`, `db:reset` (down -v), `db:push` (local dev DB), `db:push:test` (local test DB), `db:seed` (seed.ts against local dev DB). `db:push`/`db:push:test` now pin DATABASE_URL explicitly via cross-env — drizzle-kit auto-loads `.env` (Neon) otherwise, which made a bare `db:push` hit the remote dev DB.
- `.env.local` (gitignored) points `DATABASE_URL` + PG*/POSTGRES\_* vars at `localhost:5433/familycalendar`; Neon URL kept as comment. `ADAPTER="node"` for local dev. e2e (playwright.config loads `.env.local`) and `vite dev` now run against local Docker.
- `cross-env@10.0.0` devDependency.
- Schema pushed to both DBs (33 tables each); seed ran (`db:seed`): subscription types, discounts, ad events.
- Runtime migration runner (`__schema_migrations`) still applies bundled SQL migrations on first request — no schema drift vs deployed envs.

## Needs doing

- (none)

## Notes

- Reset everything: `npm run db:reset && npm run db:up && npm run db:push && npm run db:push:test && npm run db:seed`
- Vercel/Neon envs are untouched; `db:push:preview` / `db:push:prod` still target remote via `.env.preview`/`.env.prod`.
- One-off incident during setup: first `db:push` (before pinning DATABASE_URL) synced drizzle schema against the Neon dev DB — drift fix only (constraint/PK changes), same schema `db:push:preview` applies.
