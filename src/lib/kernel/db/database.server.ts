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
import { drizzle, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import type { Ctx } from '../ctx/ctx.server';

export type Db = PgDatabase<PostgresJsQueryResultHKT>;

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
