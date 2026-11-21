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
 * - push     legacy `fcmService` FCM transport behind the kernel `Push` port
 *            (./pushTransport.server.ts); the web-push half has no legacy
 *            import. Stays until the kernel grows its own FCM sender.
 *
 * `faults` is not a bridge any more: it is `feedback`'s `fileAutoBugReport`
 * through the module's public entry, so `endpoint()`'s 5xx filing reaches one
 * service that owns the #153 skip, the 10-minute throttle and its own catch.
 * `hooks.handleError` still files with the legacy builder until APP-03 moves
 * the session pipeline; `runRetention` (./retention.server.ts) now calls the
 * modules' prunes, so the cleanup cron no longer touches legacy code.
 *
 * Doc: src/lib/app/README.md
 */
import { db } from '$lib/server/db';
import { logEvent } from '$lib/server/services/logger';
import { rateLimit } from '$lib/server/utils/rateLimit';
import { fileAutoBugReport } from '$lib/domains/feedback/index.server';
import { createCerebrasAi } from '$lib/kernel/ai/cerebrasAi.server';
import type { Ctx, Fault } from '$lib/kernel/ctx/ctx.server';
import { createFetchOutboundHttp } from '$lib/kernel/http/fetchOutboundHttp.server';
import { systemIds } from '$lib/kernel/ids/ids';
import { createResendMailer } from '$lib/kernel/mail/resendMailer.server';
import { systemClock } from '$lib/kernel/time/clock';
import { resolveCodePepper, resolveSessionSecret } from '$lib/domains/identity/index.server';
import { wirePorts } from './ports.server';
import { createPushTransport } from './pushTransport.server';

const production = process.env.NODE_ENV === 'production';

/** Production without `BETTER_AUTH_SECRET` refuses to boot (identity's rule). */
const sessionSecret = resolveSessionSecret(process.env.BETTER_AUTH_SECRET, production);

/** Production without `EMAILSECRET` refuses to boot (identity's Q-117 rule). */
const codePepper = resolveCodePepper(process.env.EMAILSECRET, production);

const mailFrom = process.env.NOREPLYEMAIL ?? '';
/**
 * The public origin mailed links point at — the legacy `getUrl()` rule
 * (`src/lib/utils/getUrl.ts`): localhost while developing, the test host under
 * NODE_ENV=test, the marketing origin otherwise.
 */
const siteUrl =
	process.env.NODE_ENV === 'development'
		? 'http://localhost:5173'
		: process.env.NODE_ENV === 'test'
			? 'https://test.familyplanz.com'
			: 'https://familyplanz.com';
const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@familyplanz.com';
const cerebrasModel = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
/** The legacy geocoder's `User-Agent`, unchanged (`api/location-search/+server.ts`). */
const userAgent = 'FamilyPlanz/1.0 (test@familyplanz.com)';

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
	faults: {
		// Fire-and-forget by design: `fileAutoBugReport` catches its own failures
		// (and skips anonymous callers, #153), so a failed auto-report can never
		// break the error response; the extra `catch` keeps a future regression
		// from turning a fault into an unhandled rejection.
		report: (fault: Fault) => void fileAutoBugReport(appCtx, fault).catch(() => {})
	},
	config: {
		cronSecret: process.env.CRON_SECRET ?? null,
		sessionSecret,
		codePepper,
		production,
		mailFrom,
		siteUrl,
		vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
		vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? null,
		vapidSubject,
		fcmServiceAccount: process.env.FCM_SERVICE_ACCOUNT_JSON ?? null,
		cerebrasApiKey: process.env.CEREBRAS_API_KEY ?? null,
		cerebrasModel,
		userAgent
	}
} satisfies Ctx);
