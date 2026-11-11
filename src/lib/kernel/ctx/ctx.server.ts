/**
 * Ctx = every side-effecting dependency a service may use, passed explicitly
 * as the FIRST argument of every service function:
 *
 *   export async function createTask(ctx: Ctx, actor: Actor, input: NewTask): Promise<Task>
 *
 * Production builds one Ctx per process (src/lib/app/appCtx.server.ts) and
 * the hooks put it on `event.locals.ctx`. Tests build one with
 * `testCtx()` (src/lib/kernel/testing/testCtx.server.ts) and swap any port.
 * This is why no test ever needs `vi.mock` (arch rule R9).
 *
 * Add a port only when a ported module needs it (mail, push, ai, http ...):
 * recipe in docs/rewrite/playbooks/add-a-port.md.
 *
 * Doc: src/lib/kernel/README.md#ctx-and-actor
 */
import type { Db } from '../db/database.server';
import type { Ids } from '../ids/ids';
import type { Log } from '../log/jsonLog';
import type { RateLimiter } from '../ratelimit/rateLimiter';
import type { Clock } from '../time/clock';

/** A server fault (5xx) worth filing as a bug report. */
export type Fault = {
	readonly status: number;
	readonly message: string;
	readonly path: string;
	readonly userId: string | null;
};

/** Files faults; fire-and-forget, never throws, throttles itself. */
export type FaultReporter = {
	report(fault: Fault): void;
};

/** Configuration values read once from the environment by src/lib/app. */
export type AppConfig = {
	/** Shared secret for `/api/cron/*` (Vercel Cron). Null = cron endpoints refuse everyone. */
	readonly cronSecret: string | null;
};

export type Ctx = {
	readonly db: Db;
	readonly clock: Clock;
	readonly ids: Ids;
	readonly log: Log;
	readonly limiter: RateLimiter;
	readonly faults: FaultReporter;
	readonly config: AppConfig;
};
