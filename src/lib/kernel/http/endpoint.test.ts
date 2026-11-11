import { describe, expect, it } from 'vitest';
import { actorFromUser } from '../ctx/actor';
import { conflict, notFound } from '../errors/appError';
import { invoke } from '../testing/invokeHandlers.server';
import { testCtx } from '../testing/testCtx.server';
import { z } from '../validation/validators';
import { created, endpoint, ok } from './endpoint.server';

const member = actorFromUser({ id: 'u1', email: 'u1@example.test', roles: [] }, 'session');
const admin = actorFromUser({ id: 'a1', email: 'a1@example.test', roles: ['admin'] }, 'token');

const echo = endpoint({
	auth: 'user',
	query: z.object({ eventId: z.string().optional() }),
	body: z.object({
		title: z.string({ error: 'Title is required' }).trim().min(1, { error: 'Title is required' })
	}),
	handle: async ({ actor, query, body }) =>
		created({ by: actor.id, eventId: query.eventId ?? null, title: body.title })
});

describe('endpoint auth', () => {
	it('answers 401 {"error":"Unauthorized"} to a signed-out caller before touching input', async () => {
		const res = await invoke(echo.handler, { ctx: testCtx(), rawBody: '{not json' });
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('answers 403 {"error":"Forbidden"} to a signed-in non-admin on admin endpoints', async () => {
		const adminOnly = endpoint({ auth: 'admin', handle: async () => ok({ secret: true }) });
		expect((await invoke(adminOnly.handler, { ctx: testCtx(), actor: member })).status).toBe(403);
		expect((await invoke(adminOnly.handler, { ctx: testCtx(), actor: admin })).body).toEqual({
			secret: true
		});
	});

	it('hands optional endpoints the actor or null', async () => {
		const whoami = endpoint({
			auth: 'optional',
			handle: async ({ actor }) => ok({ id: actor?.id ?? null })
		});
		expect((await invoke(whoami.handler, { ctx: testCtx() })).body).toEqual({ id: null });
		expect((await invoke(whoami.handler, { ctx: testCtx(), actor: member })).body).toEqual({
			id: 'u1'
		});
	});

	it('lets cron endpoints in only with the configured secret, by either header', async () => {
		const cron = endpoint({ auth: 'cron', handle: async () => ok({ ran: true }) });
		const ctx = testCtx({ cronSecret: 's3cret' });
		expect((await invoke(cron.handler, { ctx })).status).toBe(401);
		expect(
			(await invoke(cron.handler, { ctx, headers: { authorization: 'Bearer s3cret' } })).status
		).toBe(200);
		expect(
			(await invoke(cron.handler, { ctx, headers: { 'x-cron-secret': 's3cret' } })).status
		).toBe(200);
		const noSecret = testCtx({ cronSecret: null });
		expect(
			(await invoke(cron.handler, { ctx: noSecret, headers: { 'x-cron-secret': '' } })).status
		).toBe(401);
	});
});

describe('endpoint input parsing', () => {
	it('parses query and body and returns the handler response', async () => {
		const res = await invoke(echo.handler, {
			ctx: testCtx(),
			actor: member,
			query: { eventId: 'e1' },
			body: { title: '  Dishes ' }
		});
		expect(res.status).toBe(201);
		expect(res.body).toEqual({ by: 'u1', eventId: 'e1', title: 'Dishes' });
	});

	it('answers 400 with the schema message for invalid input', async () => {
		const res = await invoke(echo.handler, {
			ctx: testCtx(),
			actor: member,
			body: { title: '   ' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Title is required' });
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body instead of a 500', async () => {
		const res = await invoke(echo.handler, { ctx: testCtx(), actor: member, rawBody: '{"title":' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid JSON' });
	});

	it('reads an empty body as {} so the schema decides', async () => {
		const res = await invoke(echo.handler, {
			ctx: testCtx(),
			actor: member,
			method: 'POST',
			rawBody: ''
		});
		expect(res.body).toEqual({ error: 'Title is required' });
	});

	it('parses route params', async () => {
		const byId = endpoint({
			auth: 'user',
			params: z.object({ id: z.string().min(1) }),
			handle: async ({ params }) => ok({ id: params.id })
		});
		expect(
			(await invoke(byId.handler, { ctx: testCtx(), actor: member, params: { id: 't9' } })).body
		).toEqual({
			id: 't9'
		});
	});
});

describe('endpoint errors', () => {
	it('maps AppError to its status and merges extra fields (409 openSessionId contract)', async () => {
		const busy = endpoint({
			auth: 'user',
			handle: async () => {
				throw conflict('A phone session is already open', { openSessionId: 's1' });
			}
		});
		const res = await invoke(busy.handler, { ctx: testCtx(), actor: member });
		expect(res.status).toBe(409);
		expect(res.body).toEqual({ error: 'A phone session is already open', openSessionId: 's1' });
	});

	it('turns unexpected errors into a 500 with the fail message, a log line and a filed fault', async () => {
		const ctx = testCtx();
		const broken = endpoint({
			auth: 'user',
			failMessage: 'Failed to create task',
			handle: async () => {
				throw new Error('db exploded');
			}
		});
		const res = await invoke(broken.handler, { ctx, actor: member, path: '/api/tasks' });
		expect(res.status).toBe(500);
		expect(res.body).toEqual({ error: 'Failed to create task' });
		expect(ctx.faults.reports).toEqual([
			{ status: 500, message: 'db exploded', path: '/api/tasks', userId: 'u1' }
		]);
		expect(ctx.log.entries).toEqual([
			{
				level: 'error',
				event: 'endpoint_fault',
				fields: { path: '/api/tasks', message: 'db exploded' }
			}
		]);
	});

	it('does not file expected failures', async () => {
		const ctx = testCtx();
		const missing = endpoint({
			auth: 'user',
			handle: async () => {
				throw notFound('Task not found');
			}
		});
		const res = await invoke(missing.handler, { ctx, actor: member });
		expect(res.status).toBe(404);
		expect(ctx.faults.reports).toEqual([]);
	});
});

describe('endpoint rate limits', () => {
	it('answers 429 with the rule message once the bucket is full, per client ip', async () => {
		const ctx = testCtx();
		const report = endpoint({
			auth: 'user',
			rateLimit: {
				scope: 'bug-report',
				limit: 2,
				windowMs: 300_000,
				message: 'Too many reports. Try again shortly.'
			},
			handle: async () => ok({ success: true })
		});
		const call = (ip: string) =>
			invoke(report.handler, { ctx, actor: member, headers: { 'x-real-ip': ip } });
		expect((await call('1.1.1.1')).status).toBe(200);
		expect((await call('1.1.1.1')).status).toBe(200);
		const third = await call('1.1.1.1');
		expect(third.status).toBe(429);
		expect(third.body).toEqual({ error: 'Too many reports. Try again shortly.' });
		expect((await call('2.2.2.2')).status).toBe(200);
		ctx.clock.advanceMs(300_000);
		expect((await call('1.1.1.1')).status).toBe(200);
	});
});
