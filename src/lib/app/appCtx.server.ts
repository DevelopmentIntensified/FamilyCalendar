/**
 * Composition root: the ONE place real adapters are chosen. Everything else
 * receives them through `ctx` (kernel/ctx). `src/hooks.server.ts` puts
 * `appCtx` on `event.locals.ctx` for every request.
 *
 * TRANSITION BRIDGES (each line names the task that removes it — see
 * docs/rewrite/LEDGER.md):
 * - db       legacy pooled singleton, so ported and unported code share one
 *            pool and one transaction model. Stays (it is the real adapter);
 *            K-04 only moves where the table definitions live.
 * - limiter  legacy module-level buckets: web and mobile sign-in must share
 *            buckets until `access` is ported (issue 288). Swap to
 *            createMemoryRateLimiter(systemClock) in task APP-02.
 * - faults   legacy auto-bug-report builder + throttle + insert; the
 *            `feedback` port (M-feedback) replaces it with its service.
 * - log      legacy JSON logger; identical line format to createJsonLog.
 *
 * Doc: src/lib/app/README.md
 */
import { createBugReport } from '$lib/server/db/actions/bugReports';
import { db } from '$lib/server/db';
import { buildAutoBugReport, shouldFileAutoReport } from '$lib/server/services/autoBugReport';
import { logEvent } from '$lib/server/services/logger';
import { rateLimit } from '$lib/server/utils/rateLimit';
import type { Ctx, Fault } from '$lib/kernel/ctx/ctx.server';
import { systemIds } from '$lib/kernel/ids/ids';
import { systemClock } from '$lib/kernel/time/clock';

function fileFault(fault: Fault): void {
	try {
		const report = buildAutoBugReport(fault);
		if (
			report &&
			shouldFileAutoReport(`${report.area}:${fault.path}:${fault.message.slice(0, 120)}`)
		) {
			void createBugReport(report).catch(() => {});
		}
	} catch {
		// Filing is best-effort by design: it must never break the error response.
	}
}

export const appCtx: Ctx = {
	db,
	clock: systemClock,
	ids: systemIds,
	log: {
		info: (event, fields) => logEvent('info', event, fields),
		warn: (event, fields) => logEvent('warn', event, fields),
		error: (event, fields) => logEvent('error', event, fields)
	},
	limiter: { allow: (key, limit, windowMs) => rateLimit(key, limit, windowMs) },
	faults: { report: fileFault },
	config: { cronSecret: process.env.CRON_SECRET ?? null }
};
