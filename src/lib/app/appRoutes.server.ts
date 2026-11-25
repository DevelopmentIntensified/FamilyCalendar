/**
 * app http: the infrastructure endpoints the routes re-export — the cleanup
 * cron, the daily tasks-sweep cron and the health probe. No domain rules live
 * here; the cleanup is `runRetention` (./retention.server.ts), the sweep is
 * tasks' `sweepOverdueTaskCursors`, and the probe is the kernel's 1s-bounded
 * `pingDb`.
 *
 * Auth is the legacy route's: both crons require `CRON_SECRET` (Vercel sends
 * `Authorization: Bearer <secret>`; a manual scheduler may use
 * `x-cron-secret`), and health is public by design — an uptime monitor cannot
 * sign in. The health body is the only thing it says: `{ok, db}` — no PII, no
 * stack, no connection detail — and it always answers 200, because "the
 * database is down" is the answer, not an error.
 *
 * Doc: ./README.md#public-interface
 */
import { pingDb } from '$lib/kernel/db/database.server';
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { sweepOverdueTaskCursors } from '$lib/domains/tasks/index.server';
import { runRetention } from './retention.server';

/** `GET|POST /api/cron/cleanup`: run every retention prune; 401 without the secret. */
export const cleanupCronEndpoint = endpoint({
	auth: 'cron',
	handle: async ({ ctx }) => ok({ success: true, ...(await runRetention(ctx)) })
});

/**
 * `GET|POST /api/cron/tasks-sweep`: the daily Recurring Task cursor sweep
 * (Q-092), tasks' bounded, idempotent `sweepOverdueTaskCursors`; 401 without
 * the secret. The body is the sweep's counts; the same counts are logged.
 */
export const tasksSweepCronEndpoint = endpoint({
	auth: 'cron',
	handle: async ({ ctx }) => {
		const { scanned, pinned } = await sweepOverdueTaskCursors(ctx);
		ctx.log.info('tasks_cursor_sweep', { scanned, pinned });
		return ok({ success: true, scanned, pinned });
	}
});

/** `GET /api/health`: the 1s-bounded database ping, public, nothing else in the body. */
export const healthEndpoint = endpoint({
	auth: 'public',
	handle: async ({ ctx }) => {
		const dbUp = (await pingDb(ctx.db)) === 'up';
		return ok({ ok: dbUp, db: dbUp ? 'up' : 'down' }, { 'cache-control': 'no-store' });
	}
});
