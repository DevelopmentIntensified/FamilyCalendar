/**
 * Database type + transaction helper.
 *
 * `Db` covers both the pooled database and a transaction, so repo functions
 * written as `(db: Db, ...)` run unchanged inside `withTx` and inside the test
 * harness's rollback transaction. Nested `transaction()` calls become
 * savepoints.
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import type { Ctx } from '../ctx/ctx.server';

export type Db = PgDatabase<PostgresJsQueryResultHKT>;

/** The health probe's budget: the answer must arrive even when Postgres hangs. */
const PING_TIMEOUT_MS = 1000;

export type DbHandle = {
	readonly db: Db;
	/** Close the pool (scripts and test teardown only). */
	close(): Promise<void>;
};

export function connectDb(url: string, maxConnections = 10): DbHandle {
	const client = postgres(url, { max: maxConnections, onnotice: () => {} });
	return {
		db: drizzle(client),
		close: () => client.end({ timeout: 5 })
	};
}

/** Run `work` in one transaction; the Ctx it receives writes through that transaction. */
export function withTx<T>(ctx: Ctx, work: (txCtx: Ctx) => Promise<T>): Promise<T> {
	return ctx.db.transaction((tx) => work({ ...ctx, db: tx }));
}

/**
 * 1s-bounded `select 1` ping. Resolves 'up' | 'down' and never throws — the
 * health route only needs the boolean and must not receive stack traces or
 * connection details (the legacy probe's contract).
 */
export async function pingDb(db: Db, timeoutMs: number = PING_TIMEOUT_MS): Promise<'up' | 'down'> {
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
