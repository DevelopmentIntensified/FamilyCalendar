/**
 * app `/api` contract tests: `GET|POST /api/cron/cleanup` (the secret gate and
 * the legacy body's keys) and `GET /api/health` (public, 1s-bounded, leaks
 * nothing), written against the legacy route files before they became wiring.
 *
 * The legacy wire:
 * - cleanup without `CRON_SECRET` answers `401 {"error":"Unauthorized"}` — for
 *   GET and POST alike (the legacy `POST = GET`), with either the Vercel
 *   `Authorization: Bearer <secret>` or a manual `x-cron-secret`;
 * - with the secret it answers `200` and spreads `runCleanup()`'s result after
 *   `success: true`: `deleted`, `scanned`, `cutoff`, `notificationsPruned`,
 *   `phrasesPruned`, `bugReportsPruned`, `adEventsPruned`;
 * - health is public by design (an uptime monitor cannot sign in), always
 *   answers `200` with `{ok, db}` and `cache-control: no-store`, and a down
 *   database is `{ok:false, db:'down'}` — never a 500 and never internals.
 *
 * Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import { ANONYMOUS_EMAIL_DOMAIN } from '$lib/domains/identity/identity.person.rules';
import { GET as cleanupGet, POST as cleanupPost } from '../../routes/api/cron/cleanup/+server';
import { GET as healthGet } from '../../routes/api/health/+server';

const NOW = new Date('2026-06-01T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const SECRET = 'cron-test-secret';

function daysBefore(days: number): Date {
	return new Date(NOW.getTime() - days * DAY_MS);
}

/** A ctx whose db never answers, or answers with a rejection — the probe's two failure shapes. */
function ctxWithBrokenDb(db: () => Promise<unknown>): TestCtx {
	const ctx = testCtx();
	return { ...ctx, db: { execute: db } as unknown as Db };
}

afterEach(() => {
	vi.useRealTimers();
});

describe('GET|POST /api/cron/cleanup', () => {
	rollbackTest('answers 401 {"error":"Unauthorized"} without the secret, for GET and POST', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });

		for (const method of ['GET', 'POST'] as const) {
			const handler = method === 'GET' ? cleanupGet : cleanupPost;
			const refused = await invoke(handler, { ctx, method });
			expect(refused.status).toBe(401);
			expect(refused.body).toEqual({ error: 'Unauthorized' });

			const wrongSecret = await invoke(handler, {
				ctx,
				method,
				headers: { authorization: 'Bearer nope' }
			});
			expect(wrongSecret.status).toBe(401);
			expect(wrongSecret.body).toEqual({ error: 'Unauthorized' });
		}
	});

	rollbackTest('refuses every caller when CRON_SECRET is not configured', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString(), cronSecret: null });

		const res = await invoke(cleanupGet, {
			ctx,
			headers: { authorization: 'Bearer blank' }
		});
		expect(res.status).toBe(401);
	});

	rollbackTest('runs the retention prunes with the secret and answers the legacy keys', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString(), cronSecret: SECRET });

		await seedUser(db, {
			firstName: 'Guest',
			email: `stale${ANONYMOUS_EMAIL_DOMAIN}`,
			lastActiveAt: daysBefore(91)
		});
		const owner = await seedUser(db);
		await db.insert(notifications).values({
			userId: owner.id,
			type: 'task_completed',
			actorName: 'Sam',
			message: 'completed "Bins"',
			readAt: daysBefore(91).toISOString(),
			createdAt: daysBefore(120).toISOString()
		});

		const res = await invoke(cleanupGet, {
			ctx,
			headers: { authorization: `Bearer ${SECRET}` }
		});

		expect(res.status).toBe(200);
		const body = res.body as Record<string, unknown>;
		expect(Object.keys(body).sort()).toEqual([
			'adEventsPruned',
			'bugReportsPruned',
			'cutoff',
			'deleted',
			'notificationsPruned',
			'phrasesPruned',
			'scanned',
			'success'
		]);
		expect(body).toEqual({
			success: true,
			deleted: 1,
			scanned: 1,
			cutoff: daysBefore(90).toISOString(),
			notificationsPruned: 1,
			phrasesPruned: 0,
			bugReportsPruned: 0,
			adEventsPruned: 0
		});
	});

	rollbackTest('POST is the same handler: the manual x-cron-secret header runs it', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString(), cronSecret: SECRET });

		const res = await invoke(cleanupPost, { ctx, headers: { 'x-cron-secret': SECRET } });

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ success: true, deleted: 0, scanned: 0 });
	});
});

describe('GET /api/health', () => {
	it('answers 200 {ok:true, db:"up"} with no-store when the database answers', async () => {
		const ctx = ctxWithBrokenDb(async () => [{ ok: 1 }]);

		const res = await invoke(healthGet, { ctx });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true, db: 'up' });
		expect(res.headers.get('cache-control')).toBe('no-store');
	});

	it('answers 200 {ok:false, db:"down"} — not 500, no internals — when the query rejects', async () => {
		const ctx = ctxWithBrokenDb(async () => {
			throw new Error('ECONNREFUSED with secret detail');
		});

		const res = await invoke(healthGet, { ctx });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: false, db: 'down' });
		expect(res.text).not.toContain('ECONNREFUSED');
		expect(res.text).not.toContain('secret');
		expect(res.text).not.toContain('stack');
	});

	it('bounds a hanging database to one second', async () => {
		vi.useFakeTimers();
		const ctx = ctxWithBrokenDb(() => Promise.withResolvers<unknown>().promise);

		const pending = invoke(healthGet, { ctx });
		await vi.advanceTimersByTimeAsync(1000);
		const res = await pending;

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: false, db: 'down' });
	});
});
