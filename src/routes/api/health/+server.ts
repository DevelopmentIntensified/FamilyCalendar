import { sql } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

// The health probe must answer fast even when Postgres is unreachable;
// a hung connection resolves to 'down' after this budget.
const PING_TIMEOUT_MS = 1000;

/**
 * 1s-bounded `select 1` ping. Resolves 'up' | 'down' and never throws —
 * callers (the health route, external monitors via the route) only need
 * the boolean and must not receive stack traces or connection details.
 */
// `_`-prefixed: kit's endpoint validator only allows handlers + internal
// exports in +server files; this stays importable for tests and future callers.
export async function _pingDb(timeoutMs: number = PING_TIMEOUT_MS): Promise<'up' | 'down'> {
	const { promise, reject } = Promise.withResolvers<never>();
	const timer = setTimeout(() => reject(new Error('health ping timeout')), timeoutMs);
	try {
		await Promise.race([db.execute(sql`select 1`), promise]);
		return 'up';
	} catch {
		return 'down';
	} finally {
		clearTimeout(timer);
	}
}

// Unauthenticated by design: the only responses are {ok, db} — no PII,
// no internals. External uptime monitors cannot log in.
export const GET = async (): Promise<Response> => {
	const dbUp = (await _pingDb()) === 'up';
	return json({ ok: dbUp, db: dbUp ? 'up' : 'down' }, { headers: { 'cache-control': 'no-store' } });
};
