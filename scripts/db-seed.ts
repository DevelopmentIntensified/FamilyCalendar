/**
 * `npm run db:seed` — the development seed: billing's six tiers and two
 * discounts plus sponsored's five demo ad rows, each through its owning
 * module's insert-if-absent, so a re-run changes nothing.
 *
 * The ctx is production's (`src/lib/app/appCtx.server.ts`), built the way the
 * server builds it, over `DATABASE_URL`; the pool is closed at the end so the
 * script exits. An exported `DATABASE_URL` wins, so the e2e runner can seed its
 * own database; only a bare invocation falls back to the local Docker one.
 *
 * The fallback is assigned before `appCtx` is imported (it reads
 * `DATABASE_URL` at module scope, and `dotenv/config` never overrides a set
 * variable), so a developer's `.env` can never retarget `db:seed` at another
 * database — the guarantee the legacy `cross-env` line gave.
 *
 * Usage:
 *   npm run db:seed
 *   DATABASE_URL=postgres://… npx tsx scripts/db-seed.ts
 */
import { runDevSeed } from '../src/lib/app/devSeed.server';

const LOCAL_DATABASE_URL = 'postgres://postgres:postgres@localhost:5433/familycalendar';

process.env.DATABASE_URL ||= LOCAL_DATABASE_URL;

// Dynamic on purpose: static imports are hoisted ahead of the fallback above,
// and `appCtx` reads DATABASE_URL at module scope (refusing to build without
// it), so the only specifier that cannot be static is this one.
const { appCtx, appDbHandle } = await import('../src/lib/app/appCtx.server');

try {
	console.log('Seeding subscription types, discounts and demo ad events...');
	await runDevSeed(appCtx);
	console.log('Seed complete!');
} finally {
	await appDbHandle.close();
}
