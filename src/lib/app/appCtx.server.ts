/**
 * Composition root: the ONE place real adapters are chosen. Everything else
 * receives them through `ctx` (kernel/ctx). The request pipeline
 * (./requestPipeline.server.ts) puts `appCtx` on `event.locals.ctx` for every
 * request; `src/hooks.server.ts` only exports its two hooks.
 *
 * Cross-module ports (a domain reading another domain's rows) are attached by
 * `wirePorts` (./ports.server.ts), the one place they are chosen; the `/api`
 * goldens get the same adapters through `goldenCtx` (./testing/goldenCtx.server.ts).
 *
 * TRANSITION BRIDGES: none left here.
 * - db       the real pooled adapter now, built here from `DATABASE_URL` with
 *            kernel's `connectDb` (the legacy `$lib/server/db` singleton: same
 *            pool size, same fail-loud message, same `dotenv/config` loader).
 * - limiter  the kernel's in-memory sliding-window adapter on `systemClock`
 *            (APP-02), so web and mobile sign-in share the buckets `access`
 *            keys by `clientKeyOf` (issue 288).
 *
 * `faults` is not a bridge any more: it is `feedback`'s `fileAutoBugReport`
 * through the module's public entry, so `endpoint()`'s 5xx filing and the
 * pipeline's `handleError` (APP-03) reach one service that owns the #153 skip,
 * the 10-minute throttle and its own catch. `runRetention` (./retention.server.ts)
 * now calls the modules' prunes, so the cleanup cron no longer touches legacy
 * code.
 *
 * Doc: src/lib/app/README.md
 */
import 'dotenv/config';
import { fileAutoBugReport } from '$lib/domains/feedback/index.server';
import { createCerebrasAi } from '$lib/kernel/ai/cerebrasAi.server';
import type { Ctx, Fault } from '$lib/kernel/ctx/ctx.server';
import { connectDb } from '$lib/kernel/db/database.server';
import { createFetchOutboundHttp } from '$lib/kernel/http/fetchOutboundHttp.server';
import { systemIds } from '$lib/kernel/ids/ids';
import { createJsonLog } from '$lib/kernel/log/jsonLog';
import { createResendMailer } from '$lib/kernel/mail/resendMailer.server';
import { createMemoryRateLimiter } from '$lib/kernel/ratelimit/rateLimiter';
import { systemClock } from '$lib/kernel/time/clock';
import { resolveCodePepper, resolveSessionSecret } from '$lib/domains/identity/index.server';
import { wirePorts } from './ports.server';
import { createPushTransport } from './pushTransport.server';

const production = process.env.NODE_ENV === 'production';

/** The pooled production database: the legacy `$lib/server/db` singleton, same
 * pool size and fail-loud message. `dotenv/config` stays because the server
 * entry has no other `.env` loader. */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
const dbHandle = connectDb(databaseUrl);
const db = dbHandle.db;

/** Production without `BETTER_AUTH_SECRET` refuses to boot (identity's rule). */
const sessionSecret = resolveSessionSecret(process.env.BETTER_AUTH_SECRET, production);

/** Production without `EMAILSECRET` refuses to boot (identity's Q-117 rule). */
const codePepper = resolveCodePepper(process.env.EMAILSECRET, production);

const mailFrom = process.env.NOREPLYEMAIL ?? '';
/**
 * The public origin mailed links point at — the legacy `getUrl()` rule
 * (`src/lib/utils/getUrl.ts`, deleted with the sweep): localhost while
 * developing, the test host under
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
	log: createJsonLog(systemClock),
	limiter: createMemoryRateLimiter(systemClock),
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

/**
 * The pool behind `appCtx`. A server never closes it (the process owns it for
 * its lifetime); a script that must exit does — `scripts/db-seed.ts` awaits
 * `runDevSeed(appCtx)` and then closes this handle.
 */
export const appDbHandle = dbHandle;
