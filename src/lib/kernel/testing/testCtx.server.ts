/**
 * `testCtx()` — a Ctx made of in-memory fakes you can inspect:
 *
 *   const ctx = testCtx({ db });          // db from rollbackTest(), or omitted
 *   ctx.clock.set('2026-03-01T09:00:00Z');
 *   await createTask(ctx, actor, input);
 *   expect(ctx.faults.reports).toEqual([]);
 *   expect(ctx.log.entries).toContainEqual(expect.objectContaining({ event: 'task_created' }));
 *
 * Without a `db` override any database use throws a message telling you to
 * move the test into a `*.db.test.ts` file.
 *
 * Doc: src/lib/kernel/README.md#testing
 */
import type { Ctx, Fault, FaultReporter } from '../ctx/ctx.server';
import type { Db } from '../db/database.server';
import { sequentialIds } from '../ids/ids';
import type { Log, LogFields, LogLevel } from '../log/jsonLog';
import { createMemoryRateLimiter, type MemoryRateLimiter } from '../ratelimit/rateLimiter';
import { fixedClock, type FixedClock } from '../time/clock';

export type LogEntry = {
	readonly level: LogLevel;
	readonly event: string;
	readonly fields: LogFields;
};

export type MemoryLog = Log & { readonly entries: LogEntry[] };

export type MemoryFaults = FaultReporter & { readonly reports: Fault[] };

export type TestCtx = Ctx & {
	readonly clock: FixedClock;
	readonly log: MemoryLog;
	readonly faults: MemoryFaults;
	readonly limiter: MemoryRateLimiter;
};

export type TestCtxOverrides = {
	readonly db?: Db;
	readonly now?: string;
	readonly cronSecret?: string | null;
};

export function testCtx(overrides: TestCtxOverrides = {}): TestCtx {
	const clock = fixedClock(overrides.now);
	return {
		db: overrides.db ?? noDatabase(),
		clock,
		ids: sequentialIds(),
		log: memoryLog(),
		limiter: createMemoryRateLimiter(clock),
		faults: memoryFaults(),
		config: { cronSecret: overrides.cronSecret ?? 'test-cron-secret' }
	};
}

export function memoryLog(): MemoryLog {
	const entries: LogEntry[] = [];
	const push =
		(level: LogLevel) =>
		(event: string, fields: LogFields = {}) => {
			entries.push({ level, event, fields });
		};
	return { entries, info: push('info'), warn: push('warn'), error: push('error') };
}

export function memoryFaults(): MemoryFaults {
	const reports: Fault[] = [];
	return { reports, report: (fault) => reports.push(fault) };
}

const NO_DB_MESSAGE =
	'This test has no database. Rename the file to *.db.test.ts and pass `db` from rollbackTest() to testCtx({ db }).';

function noDatabase(): Db {
	const refuse = (): never => {
		throw new Error(NO_DB_MESSAGE);
	};
	// SAFETY: the proxy is never used as a real Db; every property access throws a guidance error instead.
	return new Proxy({}, { get: refuse, apply: refuse }) as Db;
}
