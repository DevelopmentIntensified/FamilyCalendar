import { describe, expect, it } from 'vitest';
import { actorFromUser } from '../ctx/actor';
import { conflict, notFound } from '../errors/appError';
import { invoke } from '../testing/invokeHandlers.server';
import { testCtx } from '../testing/testCtx.server';
import { z } from '../validation/validators';
import { created, endpoint, ok, type BodyMode, type MalformedBody } from './endpoint.server';

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

describe('endpoint query values', () => {
	// `invoke`'s `query` option uses searchParams.set (one value), so repeated keys go in `path`.
	const lookup = endpoint({
		auth: 'public',
		query: z.object({
			eventId: z.string().optional(),
			exclude: z.array(z.string())
		}),
		queryArrays: ['exclude'],
		handle: async ({ query }) => ok({ eventId: query.eventId ?? null, exclude: query.exclude })
	});

	type QueryCase = {
		readonly name: string;
		readonly path: string;
		readonly want: { readonly eventId: string | null; readonly exclude: readonly string[] };
	};

	const cases: readonly QueryCase[] = [
		{
			name: 'absent keys: a scalar stays absent and an array key arrives as []',
			path: '/',
			want: { eventId: null, exclude: [] }
		},
		{
			name: 'a scalar key with one value',
			path: '/?eventId=e1',
			want: { eventId: 'e1', exclude: [] }
		},
		{
			name: 'a repeated scalar key keeps the FIRST value (legacy get)',
			path: '/?eventId=e1&eventId=e2',
			want: { eventId: 'e1', exclude: [] }
		},
		{
			name: 'an array key with 0 values while other keys are present',
			path: '/?other=1',
			want: { eventId: null, exclude: [] }
		},
		{
			name: 'an array key with 1 value',
			path: '/?exclude=a',
			want: { eventId: null, exclude: ['a'] }
		},
		{
			name: 'an array key with 2 values keeps them all, in order',
			path: '/?exclude=b&exclude=a',
			want: { eventId: null, exclude: ['b', 'a'] }
		},
		{
			name: 'scalar and array keys together',
			path: '/?eventId=e1&eventId=e2&exclude=a&exclude=b',
			want: { eventId: 'e1', exclude: ['a', 'b'] }
		},
		{
			name: 'an empty value stays present as "" (not absent), for both kinds',
			path: '/?eventId=&exclude=',
			want: { eventId: '', exclude: [''] }
		}
	];

	it.each(cases)('$name', async ({ path, want }) => {
		const res = await invoke(lookup.handler, { ctx: testCtx(), path });
		expect(res.status).toBe(200);
		expect(res.body).toEqual(want);
	});
});

describe('endpoint body modes', () => {
	// Distinct copy per layer: 'Bad a' comes from the field, 'Bad body' from the object itself.
	const schema = z.object({ a: z.string({ error: 'Bad a' }) }, { error: 'Bad body' });
	const modes = {
		json: endpoint({
			auth: 'public',
			body: schema,
			bodyMode: 'json',
			handle: async ({ body }) => ok({ a: body.a })
		}),
		lenient: endpoint({
			auth: 'public',
			body: schema,
			bodyMode: 'lenient',
			handle: async ({ body }) => ok({ a: body.a })
		})
	};

	type BodyCase = {
		readonly mode: keyof typeof modes;
		readonly name: string;
		readonly rawBody: string;
		readonly want: { readonly status: number; readonly body: { readonly [key: string]: string } };
	};
	const refused = (error: string): BodyCase['want'] => ({ status: 400, body: { error } });
	const accepted: BodyCase['want'] = { status: 200, body: { a: 'ok' } };
	const cases: readonly BodyCase[] = [
		{ mode: 'json', name: 'malformed JSON', rawBody: '{"a":', want: refused('Invalid JSON') },
		{ mode: 'json', name: 'an empty body', rawBody: '', want: refused('Bad a') },
		{ mode: 'json', name: 'a whitespace body', rawBody: ' \n\t ', want: refused('Bad a') },
		{ mode: 'json', name: 'the literal null', rawBody: 'null', want: refused('Bad body') },
		{ mode: 'json', name: 'a string', rawBody: '"x"', want: refused('Bad body') },
		{ mode: 'json', name: 'an array', rawBody: '[1]', want: refused('Bad body') },
		{ mode: 'json', name: 'a valid object', rawBody: '{"a":"ok"}', want: accepted },
		{ mode: 'lenient', name: 'malformed JSON', rawBody: '{"a":', want: refused('Bad body') },
		{ mode: 'lenient', name: 'an empty body', rawBody: '', want: refused('Bad body') },
		{ mode: 'lenient', name: 'a whitespace body', rawBody: ' \n\t ', want: refused('Bad body') },
		{ mode: 'lenient', name: 'the literal null', rawBody: 'null', want: refused('Bad body') },
		{ mode: 'lenient', name: 'a string', rawBody: '"x"', want: refused('Bad body') },
		{ mode: 'lenient', name: 'an array', rawBody: '[1]', want: refused('Bad body') },
		{ mode: 'lenient', name: 'a valid object', rawBody: '{"a":"ok"}', want: accepted }
	];

	it.each(cases)('$mode mode: $name -> $want.status', async ({ mode, rawBody, want }) => {
		const res = await invoke(modes[mode].handler, { ctx: testCtx(), rawBody });
		expect(res.status).toBe(want.status);
		expect(res.body).toEqual(want.body);
	});

	it('keeps the default mode identical to json', async () => {
		const byDefault = endpoint({
			auth: 'public',
			body: schema,
			handle: async ({ body }) => ok({ a: body.a })
		});
		const malformed = await invoke(byDefault.handler, { ctx: testCtx(), rawBody: '{"a":' });
		expect(malformed.body).toEqual({ error: 'Invalid JSON' });
		const empty = await invoke(byDefault.handler, { ctx: testCtx(), rawBody: '' });
		expect(empty.body).toEqual({ error: 'Bad a' });
	});

	// The table above refuses every non-object with 'Bad body', which a reader
	// that turned everything into null would also pass. Echoing what reached the
	// schema proves lenient passes parseable bodies through untouched.
	it.each<[string, string, unknown]>([
		['a string', '"x"', 'x'],
		['an array', '[1]', [1]],
		['the literal null', 'null', null],
		['malformed JSON', '{"a":', null],
		['an empty body', '', null]
	])('lenient mode hands %s to the schema as: %j', async (_name, rawBody, expected) => {
		const echo = endpoint({
			auth: 'public',
			body: z.json(),
			bodyMode: 'lenient',
			handle: async ({ body }) => ok({ got: body })
		});
		const res = await invoke(echo.handler, { ctx: testCtx(), rawBody });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ got: expected });
	});
});

describe('endpoint malformed body copy', () => {
	// 'Bad a' comes from the field, 'Bad body' from the object itself.
	const schema = z.object({ a: z.string({ error: 'Bad a' }) }, { error: 'Bad body' });
	const pinned: MalformedBody = { status: 422, error: 'Invalid JSON body' };
	const copyOnly: MalformedBody = { error: 'Invalid JSON body' };

	type Row = {
		readonly mode: BodyMode | undefined;
		readonly copy: MalformedBody | undefined;
		readonly name: string;
		readonly rawBody: string;
		readonly want: { readonly status: number; readonly body: { readonly [key: string]: string } };
	};
	const build = (mode: BodyMode | undefined, copy: MalformedBody | undefined) =>
		endpoint({
			auth: 'public',
			body: schema,
			...(mode ? { bodyMode: mode } : {}),
			...(copy ? { malformedBody: copy } : {}),
			handle: async ({ body }) => ok({ a: body.a })
		});
	const cases: readonly Row[] = [
		{
			mode: undefined,
			copy: undefined,
			name: 'default reader: malformed JSON keeps the house copy',
			rawBody: '{"a":',
			want: { status: 400, body: { error: 'Invalid JSON' } }
		},
		{
			mode: 'json',
			copy: undefined,
			name: 'json mode: an empty body is still {} for the schema',
			rawBody: '',
			want: { status: 400, body: { error: 'Bad a' } }
		},
		{
			mode: undefined,
			copy: undefined,
			name: 'default reader: a valid object is untouched',
			rawBody: '{"a":"ok"}',
			want: { status: 200, body: { a: 'ok' } }
		},
		{
			mode: 'json',
			copy: pinned,
			name: 'custom copy: malformed JSON',
			rawBody: '{"a":',
			want: { status: 422, body: { error: 'Invalid JSON body' } }
		},
		{
			mode: 'json',
			copy: pinned,
			name: 'custom copy: an empty body (legacy request.json() threw)',
			rawBody: '',
			want: { status: 422, body: { error: 'Invalid JSON body' } }
		},
		{
			mode: 'json',
			copy: pinned,
			name: 'custom copy: a whitespace body',
			rawBody: ' \n\t ',
			want: { status: 422, body: { error: 'Invalid JSON body' } }
		},
		{
			mode: 'json',
			copy: pinned,
			name: 'custom copy: a valid object is untouched',
			rawBody: '{"a":"ok"}',
			want: { status: 200, body: { a: 'ok' } }
		},
		{
			mode: 'json',
			copy: pinned,
			name: 'custom copy: the literal null parses, so the schema answers',
			rawBody: 'null',
			want: { status: 400, body: { error: 'Bad body' } }
		},
		{
			mode: 'json',
			copy: pinned,
			name: 'custom copy: an array parses, so the schema answers',
			rawBody: '[1]',
			want: { status: 400, body: { error: 'Bad body' } }
		},
		{
			mode: 'json',
			copy: copyOnly,
			name: 'custom copy without a status answers 400',
			rawBody: '{"a":',
			want: { status: 400, body: { error: 'Invalid JSON body' } }
		},
		{
			mode: 'lenient',
			copy: pinned,
			name: 'lenient mode ignores the copy: the schema decides malformed JSON',
			rawBody: '{"a":',
			want: { status: 400, body: { error: 'Bad body' } }
		},
		{
			mode: 'lenient',
			copy: pinned,
			name: 'lenient mode ignores the copy: the schema decides an empty body',
			rawBody: '',
			want: { status: 400, body: { error: 'Bad body' } }
		}
	];

	it.each(cases)('$name -> $want.status', async ({ mode, copy, rawBody, want }) => {
		const res = await invoke(build(mode, copy).handler, { ctx: testCtx(), rawBody });
		expect(res.status).toBe(want.status);
		expect(res.body).toEqual(want.body);
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
