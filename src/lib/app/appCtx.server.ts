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
 * - faults   legacy auto-bug-report builder + throttle + insert; the
 *            `feedback` port (M-feedback) replaces it with its service.
 * - log      legacy JSON logger; identical line format to createJsonLog.
 * - push     legacy `fcmService` FCM transport behind the kernel `Push` port
 *            (./pushTransport.server.ts); the web-push half has no legacy
 *            import. Stays until the kernel grows its own FCM sender.
 *
 * Doc: src/lib/app/README.md
 */
import { createBugReport } from '$lib/server/db/actions/bugReports';
import { db } from '$lib/server/db';
import { buildAutoBugReport, shouldFileAutoReport } from '$lib/server/services/autoBugReport';
import { logEvent } from '$lib/server/services/logger';
import { rateLimit } from '$lib/server/utils/rateLimit';
import { createCerebrasAi } from '$lib/kernel/ai/cerebrasAi.server';
import type { Ctx, Fault } from '$lib/kernel/ctx/ctx.server';
import { createFetchOutboundHttp } from '$lib/kernel/http/fetchOutboundHttp.server';
import { systemIds } from '$lib/kernel/ids/ids';
import { createResendMailer } from '$lib/kernel/mail/resendMailer.server';
import { systemClock } from '$lib/kernel/time/clock';
import { wirePorts } from './ports.server';
import { createPushTransport } from './pushTransport.server';

const mailFrom = process.env.NOREPLYEMAIL ?? '';
const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@familyplanz.com';
const cerebrasModel = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
/** The legacy geocoder's `User-Agent`, unchanged (`api/location-search/+server.ts`). */
const userAgent = 'FamilyPlanz/1.0 (test@familyplanz.com)';
const DEV_FALLBACK_SECRET = 'better-auth-placeholder-secret-change-me';

/**
 * `BETTER_AUTH_SECRET` with the legacy `auth.ts` contract: a production cold
 * start without one fails loudly instead of signing forgeable cookies; every
 * other environment keeps the placeholder secret so zero-env builds run.
 */
function sessionSecret(): string {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret && process.env.NODE_ENV === 'production') {
		throw new Error(
			'BETTER_AUTH_SECRET is required in production — refusing to sign sessions with the placeholder key.'
		);
	}
	return secret ?? DEV_FALLBACK_SECRET;
}

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
	push: createPushTransport({
		vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
		vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? null,
		vapidSubject,
		fcmServiceAccount: process.env.FCM_SERVICE_ACCOUNT_JSON ?? null
	}),
	ai: createCerebrasAi({
		apiKey: process.env.CEREBRAS_API_KEY ?? null,
		model: cerebrasModel,
		apiUrl: process.env.CEREBRAS_API_URL
	}),
	http: createFetchOutboundHttp(),
	faults: { report: fileFault },
	config: {
		cronSecret: process.env.CRON_SECRET ?? null,
		mailFrom,
		sessionSecret: sessionSecret(),
		vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
		vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? null,
		vapidSubject,
		fcmServiceAccount: process.env.FCM_SERVICE_ACCOUNT_JSON ?? null,
		cerebrasApiKey: process.env.CEREBRAS_API_KEY ?? null,
		cerebrasModel,
		userAgent
	}
} satisfies Ctx);
