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
import type { Ai } from '../ai/ai';
import type { Db } from '../db/database.server';
import type { Http } from '../http/outboundHttp';
import type { Ids } from '../ids/ids';
import type { Log } from '../log/jsonLog';
import type { Mailer } from '../mail/mailer';
import type { Push } from '../push/push';
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
	/** Default module-mail sender (`NOREPLYEMAIL`), for a service that must pass `from` explicitly. */
	readonly mailFrom: string;
	/** Signing secret for session cookies (`BETTER_AUTH_SECRET`); app refuses to boot in production without one. */
	readonly sessionSecret: string;
	/** Web Push public key (`VAPID_PUBLIC_KEY`) — also what `GET /api/push/public-key` answers. */
	readonly vapidPublicKey: string | null;
	/** Web Push private key (`VAPID_PRIVATE_KEY`); the transport stays off unless both halves are set. */
	readonly vapidPrivateKey: string | null;
	/** VAPID contact (`VAPID_SUBJECT`, the legacy `mailto:` default). */
	readonly vapidSubject: string;
	/** FCM service-account key (`FCM_SERVICE_ACCOUNT_JSON`), raw JSON or base64 of it. Null = no device push. */
	readonly fcmServiceAccount: string | null;
	/** Cerebras API key (`CEREBRAS_API_KEY`). Null = no cloud parse; `/api/parse-event` uses its regex parser. */
	readonly cerebrasApiKey: string | null;
	/** Cerebras model id (`CEREBRAS_MODEL`, legacy default `gpt-oss-120b`). */
	readonly cerebrasModel: string;
	/** `User-Agent` for outbound calls (the legacy Nominatim literal). */
	readonly userAgent: string;
};

export type Ctx = {
	readonly db: Db;
	readonly clock: Clock;
	readonly ids: Ids;
	readonly log: Log;
	readonly limiter: RateLimiter;
	readonly mail: Mailer;
	readonly push: Push;
	readonly ai: Ai;
	readonly http: Http;
	readonly faults: FaultReporter;
	readonly config: AppConfig;
};
