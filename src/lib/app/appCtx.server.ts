/**
 * Composition root: the ONE place real adapters are chosen. Everything else
 * receives them through `ctx` (kernel/ctx). `src/hooks.server.ts` puts
 * `appCtx` on `event.locals.ctx` for every request.
 *
 * Cross-module ports (a domain reading another domain's rows) are attached by
 * `wirePorts` (./ports.server.ts), the one place they are chosen; the `/api`
 * goldens get the same adapters through `goldenCtx` (./testing/goldenCtx.server.ts).
 *
 * TRANSITION BRIDGES (each line names the task that removes it — see
 * docs/rewrite/LEDGER.md):
 * - db       legacy pooled singleton, so ported and unported code share one
 *            pool and one transaction model. Stays (it is the real adapter);
 *            K-04 only moves where the table definitions live.
 * - limiter  legacy module-level buckets: web and mobile sign-in must share
 *            buckets until `access` is ported (issue 288). Swap to
 *            createMemoryRateLimiter(systemClock) in task APP-02.
 * - log      legacy JSON logger; identical line format to createJsonLog.
 *
 * `faults` is not a bridge any more: it is `feedback`'s `fileAutoBugReport`
 * through the module's public entry, so `endpoint()`'s 5xx filing reaches one
 * service that owns the #153 skip, the 10-minute throttle and its own catch.
 * `hooks.handleError` still files with the legacy builder until APP-03 moves
 * the session pipeline; the cleanup cron still calls the legacy prunes until
 * APP-01's `runRetention` calls `pruneFeedbackOlderThan`.
 *
 * Doc: src/lib/app/README.md
 */
import { db } from '$lib/server/db';
import { logEvent } from '$lib/server/services/logger';
import { rateLimit } from '$lib/server/utils/rateLimit';
import { fileAutoBugReport } from '$lib/domains/feedback/index.server';
import type { Ctx, Fault } from '$lib/kernel/ctx/ctx.server';
import { systemIds } from '$lib/kernel/ids/ids';
import { createResendMailer } from '$lib/kernel/mail/resendMailer.server';
import { systemClock } from '$lib/kernel/time/clock';
import { wirePorts } from './ports.server';

const mailFrom = process.env.NOREPLYEMAIL ?? '';

export const appCtx = wirePorts({
	db,
	clock: systemClock,
	ids: systemIds,
	log: {
		info: (event, fields) => logEvent('info', event, fields),
		warn: (event, fields) => logEvent('warn', event, fields),
		error: (event, fields) => logEvent('error', event, fields)
	},
	limiter: { allow: (key, limit, windowMs) => rateLimit(key, limit, windowMs) },
	mail: createResendMailer({ apiKey: process.env.RESEND_API_KEY ?? '', from: mailFrom }),
	faults: {
		// Fire-and-forget by design: `fileAutoBugReport` catches its own failures
		// (and skips anonymous callers, #153), so a failed auto-report can never
		// break the error response; the extra `catch` keeps a future regression
		// from turning a fault into an unhandled rejection.
		report: (fault: Fault) => void fileAutoBugReport(appCtx, fault).catch(() => {})
	},
	config: { cronSecret: process.env.CRON_SECRET ?? null, mailFrom }
} satisfies Ctx);
