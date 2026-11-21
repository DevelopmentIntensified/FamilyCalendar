/**
 * `testCtx()` — a Ctx made of in-memory fakes you can inspect:
 *
 *   const ctx = testCtx({ db });          // db from rollbackTest(), or omitted
 *   ctx.clock.set('2026-03-01T09:00:00Z');
 *   await createTask(ctx, actor, input);
 *   expect(ctx.faults.reports).toEqual([]);
 *   expect(ctx.log.entries).toContainEqual(expect.objectContaining({ event: 'task_created' }));
 *   expect(ctx.mail.outbox).toEqual([]);      // mail a service sent, in order
 *   expect(ctx.push.sent).toEqual([]);        // push messages, in order (unconfigured by default)
 *   ctx.http.reply('https://example.test/a', { body: '[]' });  // scripted outbound reply
 *
 * Without a `db` override any database use throws a message telling you to
 * move the test into a `*.db.test.ts` file.
 *
 * Doc: src/lib/kernel/README.md#testing
 */
import { createMemoryAi, type MemoryAi } from '../ai/ai';
import type { Ctx, Fault, FaultReporter } from '../ctx/ctx.server';
import type { Db } from '../db/database.server';
import { createMemoryHttp, type MemoryHttp } from '../http/outboundHttp';
import { sequentialIds } from '../ids/ids';
import type { Log, LogFields, LogLevel } from '../log/jsonLog';
import { createMemoryMailer, type MemoryMailer } from '../mail/mailer';
import { createMemoryPush, type MemoryPush } from '../push/push';
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
	readonly mail: MemoryMailer;
	readonly push: MemoryPush;
	readonly ai: MemoryAi;
	readonly http: MemoryHttp;
};

/** The pepper `testCtx()` hashes email codes with; tests that seed a digest use it too. */
export const TEST_CODE_PEPPER = 'test-code-pepper';

/**
 * The pepper `/api` goldens hash and verify e-mail codes with: the environment's
 * `EMAILSECRET` — the value SvelteKit bakes for the legacy `$env/static/private`
 * import a frozen golden's own JWT mint reads — else the committed test value.
 * It lives in kernel/testing because R6 allows the environment read here, and
 * both `goldenCtx` and the module fixtures need the SAME value to seed rows a
 * ported handler can redeem.
 */
export const GOLDEN_CODE_PEPPER =
	process.env.EMAILSECRET ?? 'test-email-secret-key-for-testing-only-32chars';

export type TestCtxOverrides = {
	readonly db?: Db;
	readonly now?: string;
	readonly cronSecret?: string | null;
	readonly sessionSecret?: string;
	readonly codePepper?: string;
	readonly production?: boolean;
};

export function testCtx(overrides: TestCtxOverrides = {}): TestCtx {
	const clock = fixedClock(overrides.now);
	return {
		db: overrides.db ?? noDatabase(),
		clock,
		ids: sequentialIds(),
		log: memoryLog(),
		limiter: createMemoryRateLimiter(clock),
		mail: createMemoryMailer(),
		// The zero-env legacy behaviour a golden must reproduce: no VAPID key, no
		// FCM account, no Cerebras key — so nothing is "configured" by default.
		push: createMemoryPush({ devicesConfigured: false }),
		ai: createMemoryAi({ configured: false }),
		http: createMemoryHttp(),
		faults: memoryFaults(),
		config: {
			cronSecret: overrides.cronSecret ?? 'test-cron-secret',
			sessionSecret: overrides.sessionSecret ?? 'test-session-secret',
			codePepper: overrides.codePepper ?? TEST_CODE_PEPPER,
			production: overrides.production ?? false,
			mailFrom: 'noReply@familyplanz.com',
			// The legacy `getUrl()` answer under NODE_ENV=test.
			siteUrl: 'https://test.familyplanz.com',
			vapidPublicKey: null,
			vapidPrivateKey: null,
			vapidSubject: 'mailto:admin@familyplanz.com',
			fcmServiceAccount: null,
			cerebrasApiKey: null,
			cerebrasModel: 'gpt-oss-120b',
			userAgent: 'FamilyPlanz/1.0 (test@familyplanz.com)'
		}
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
