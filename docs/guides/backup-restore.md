# Backup & Restore Runbook (Neon PITR + pg_dump drill)

Issue: #177. Purpose: know what Neon gives us, prove restore works, measure RPO/RTO. Read once; run the drill when asked.

## 1. What Neon provides

Our Postgres runs on Neon (post-Vercel-marketplace, ep-plain-cloud-a5hugp4l). Neon is not a single-instance DB server — it keeps a continuous WAL record of every change and can roll any **root branch** back to any timestamp/LSN within the project's **history window** ("instant restore" / PITR). No traditional backup files for PITR; it's rebuild-from-WAL and finishes in seconds, in place.

Key mechanics (Neon docs: [Instant restore](https://neon.com/docs/postgres/backup-restore/branch-restore), [History window](https://neon.com/docs/postgres/backup-restore/history-window), [Backup strategies](https://neon.com/docs/postgres/backup-restore/backups)):

- **History window** = how far back PITR/Time Travel can reach. Per-plan (default / max): Free 6h / 6h (≤1 GB), Launch 1d / 7d, Scale 1d / 30d. Billed ~$0.20/GB-month as "History". Per-project setting; `0` disables PITR entirely.
- PITR only on **root branches**; child branches are not restorable in place (their protection is being a cheap copy of a root).
- Restore **overwrites** the branch's whole timeline, for **all databases on that branch** (incl. `neon_auth` schema). Connections are interrupted briefly; connection string unchanged.
- Neon auto-creates a backup branch (`{branch}_old_{timestamp}`) of the pre-restore state — that is the rollback path, not a merge.
- **Time Travel Assist** = read-only SQL against a historical timestamp *before* restoring, to verify the target point.
- Object storage (Vercel Blob ad assets) and Neon Functions are **NOT** part of the timeline — not reverted by a restore.

PITR is therefore our **RPO clamp**: data loss ≤ how far we are inside the history window, i.e. recoverable back to `now − history window` provided the window is ≥ the noticing-to-acting delay. It is instant, free of tooling, but only in-place on the same branch — use the pg_dump drill below when we need an out-of-Neon copy (compliance, migration, restore-into-a-different-branch).

### Our windows — [INFERENCE]

The repo does not record which Neon plan either project is on or what `history_retention_seconds` is set to; it is only verifiable in the Neon console (Settings → Postgres → History window). Assume worst case until confirmed: default 1 day (or 6h if either project is on the Free plan). Human step below confirms both.

## 2. Environment facts (from repo)

- Neon connection strings live only in local, gitignored env files: `.env` / `.env.local` (current Vercel env), and `.env.preview` / `.env.prod` as set up by `scripts/deploy.mjs` / `npm run ci:secrets:*` convention. `.env.example` shows the variable shape: `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`.
- **Use the UNPOOLED URL for `pg_dump`/`pg_restore`** — pooled endpoints hold the connection in PgBouncer and can break dump/restore sessions.
- Local target: Docker Postgres 16 from `docker-compose.yml` (`npm run db:up`), host port **5433**, user/pass `postgres`/`postgres`, db `familycalendar`. A second db `familycalendar_test` exists for tests (`npm run db:push:test`).
- `psql` / `pg_dump` / `pg_restore` must be installed locally (Postgres client on PATH; Docker image itself has none exposed — run the tools from the host).

## 3. Restore-drill runbook (staging → local)

Goal: prove a real Neon staging branch can be dumped and restored byte-for-byte into local Docker Postgres, and record timings. Run in a scratch terminal; do not run against the prod branch without asking.

```bash
# 0. Load source connection string (staging).
#    Never paste credentials on the command line; export them instead.
set -a
source .env            # or .env.preview — the file whose DATABASE_URL is the staging/preview branch
set +a
SOURCE_URL="$DATABASE_URL_UNPOOLED"   # falls back to DATABASE_URL if UNPOOLED missing

# Sanity: what are we connected to?
psql "$SOURCE_URL" -c "select current_database(), inet_server_addr(), version();"
psql "$SOURCE_URL" -c "select count(*) from \"CalendarEvent\";"   # table names: check drizzle/schema.ts

# 1. Start the local target.
npm run db:up          # postgres:16-alpine on localhost:5433

# 2. Create the receiving database (fresh name ⇒ no conflict with dev/test dbs).
docker exec familycalendar-db psql -U postgres -c 'CREATE DATABASE restore_drill;'

# 3. Dump from Neon (schema + data).
time pg_dump "$SOURCE_URL" --no-owner --no-privileges \
     -Fc -Z0 -f drill.dump

# 4. Restore into local.
time pg_restore --dbname "postgres://postgres:postgres@localhost:5433/restore_drill" \
     --no-owner --no-privileges --exit-on-error drill.dump

# 5. Verify.
psql "postgres://postgres:postgres@localhost:5433/restore_drill" -c \
  "select count(*) from \"CalendarEvent\";"     # row counts must match step 0
docker exec familycalendar-db psql -U postgres -d restore_drill \
  -c "select datname, pg_size_pretty(pg_database_size(datname)) from pg_database;"

# 6. Tear down the drill db (keep drill.dump as evidence/timing record if asked).
docker exec familycalendar-db psql -U postgres -c 'DROP DATABASE restore_drill;'
rm drill.dump
```

Notes:
- `-Z0` disables compression — dump/restore timings then measure pure data transfer, not host-side compression noise.
- If pg_restore fails on Neon-only schemas (`neon_auth`), dump with `--schema=public` (add further `--schema=` flags per app schema) so only app data moves; `pg_restore` has no `--exclude-schema`.
- Larger DBs: consider `--jobs=4` on pg_restore.
- Full-file alternative for tiny DBs: `pg_dump "$SOURCE_URL" --schema=public > drill.sql` + `psql "$LOCAL_URL" -f drill.sql`.

DR (`pg_dump`/`pg_restore` with Neon): see <https://neon.com/docs/manage/backup-pg-dump>; scheduled/automated dumps: <https://neon.com/docs/manage/backup-pg-dump-automate>.

## 4. RPO / RTO record

Fill in real numbers after the drill (section 5). Targets marked `[INFERENCE]`/`[UNMEASURED]` until then.

| Metric | Meaning | Target | Current |
|---|---|---|---|
| RPO | max tolerated data loss | [INFERENCE] 1 day worst case; needs human confirmation of history window | [UNMEASURED] — depends on Neon history window per branch |
| RTO (via PITR) | time to roll staging/prod back in place | [INFERENCE] seconds (Neon claims duration of a few seconds) | [UNMEASURED] |
| RTO (via pg_dump drill) | time to get DB back from an out-of-Neon dump | [INFERENCE] minutes for current DB size | [UNMEASURED] |
| RTO (app) | redeploy app after branch restore | [INFERENCE] none — app keeps working automatically, Vercel unaffected | [UNMEASURED] |

## 5. Human steps (cannot be done from the repo)

These are console/API actions; a human with Neon access must run each and record results in section 4.

1. **Confirm PITR is enabled on BOTH branches.** Neon console → for each project (`preview` and `prod`): Settings → Postgres → History window. Record: plan name, current history window value, whether history_retention_seconds > 0. Enter both values into section 4 (RPO row). If either project is on Free plan (≤6h), flag as a production-readiness gap — recommend upgrading or enabling Scale to hold a 7-day window for prod.
2. **Run the restore drill once in staging** (section 3, using the staging branch's `.env`). Record: dump duration, restore duration, verification row count check, date run.
3. Optionally **exercise a real PITR in staging** (not prod): Console → staging branch → Backup & Restore → Restore from history, pick a point a few minutes back, use Time Travel Assist to verify first. Confirm a `{branch}_old_{ts}` backup branch was auto-created. Record: duration, observable app behavior after.

Drill failure = issue #177 not closed. Restore that has never been exercised is hypothesis, not a backup.
