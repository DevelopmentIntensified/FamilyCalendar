import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Phone focus sessions (#293, TaskFocus #124) at the route seam: every row
 * of the contract table. The domain module runs for real against the
 * in-memory store (same guards as the drizzle store); the drizzle store
 * itself is covered by taskfocusSessions.real.test.ts.
 */
import type * as Sessions from '$lib/server/db/actions/taskfocusSessions';
import {
	memoryStore,
	type MemoryStore
} from '$lib/server/db/actions/taskfocusSessions.memoryStore';

const holder = vi.hoisted(() => ({ store: null as unknown as MemoryStore }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- no Postgres in this suite; the drizzle store is exercised by the .real.test.
vi.mock('$lib/server/db', () => ({ db: {} }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- injects the in-memory store; the domain rules stay REAL.
vi.mock('$lib/server/db/actions/taskfocusSessions', async (importOriginal) => {
	const orig = await importOriginal<typeof Sessions>();
	return {
		...orig,
		createPhoneSession: (u: string, b: Record<string, unknown>, now?: Date) =>
			orig.createPhoneSession(u, b, now, holder.store),
		endPhoneSession: (u: string, id: string, b: Record<string, unknown>) =>
			orig.endPhoneSession(u, id, b, holder.store),
		deletePhoneSession: (u: string, id: string) => orig.deletePhoneSession(u, id, holder.store),
		absorbPhoneSession: (u: string, id: string, now?: Date) =>
			orig.absorbPhoneSession(u, id, now, holder.store),
		listUnabsorbedSessions: (u: string) => orig.listUnabsorbedSessions(u, holder.store)
	};
});

import { GET, POST } from './+server';
import { PATCH, DELETE } from './[id]/+server';
import { POST as ABSORB } from './[id]/absorb/+server';

const NOW = new Date('2026-11-03T12:00:00Z');
const iso = (offsetMin: number) => new Date(NOW.getTime() + offsetMin * 60000).toISOString();

function ev(userId: string | null, opts: { body?: unknown; id?: string; query?: string } = {}) {
	const url = new URL(`http://localhost/api/taskfocus/sessions${opts.query ?? ''}`);
	return {
		locals: { user: userId ? { id: userId } : null },
		params: { id: opts.id },
		url,
		request: { url: url.toString(), json: async () => opts.body }
	} as never;
}

async function create(userId: string, body: unknown) {
	return POST(ev(userId, { body }));
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	holder.store = memoryStore();
	holder.store.grant('t1', 'me');
	holder.store.grant('t2', 'me');
	holder.store.grant('tOther', 'other');
});
afterEach(() => {
	vi.useRealTimers();
});

describe('auth', () => {
	it('401s every endpoint without a session or token', async () => {
		expect((await GET(ev(null, { query: '?unabsorbed=1' }))).status).toBe(401);
		expect((await POST(ev(null, { body: {} }))).status).toBe(401);
		expect((await PATCH(ev(null, { id: 'x', body: {} }))).status).toBe(401);
		expect((await DELETE(ev(null, { id: 'x' }))).status).toBe(401);
		expect((await ABSORB(ev(null, { id: 'x' }))).status).toBe(401);
	});
});

describe('POST /api/taskfocus/sessions', () => {
	it('201 opens a running session (no endedAt)', async () => {
		const res = await create('me', { taskId: 't1', startedAt: iso(-1) });
		expect(res.status).toBe(201);
		const { session } = await res.json();
		expect(session).toMatchObject({
			taskId: 't1',
			startedAt: iso(-1),
			endedAt: null,
			source: 'phone',
			absorbedAt: null
		});
		expect(typeof session.id).toBe('string');
	});

	it('201 records a finished offline session', async () => {
		const res = await create('me', { taskId: 't1', startedAt: iso(-90), endedAt: iso(-30) });
		expect(res.status).toBe(201);
		expect((await res.json()).session.endedAt).toBe(iso(-30));
	});

	it('400 when endedAt <= startedAt', async () => {
		expect(
			(await create('me', { taskId: 't1', startedAt: iso(-10), endedAt: iso(-10) })).status
		).toBe(400);
		expect(
			(await create('me', { taskId: 't1', startedAt: iso(-10), endedAt: iso(-20) })).status
		).toBe(400);
	});

	it('400 when start is more than 5 minutes in the future; exactly 5 is allowed', async () => {
		expect((await create('me', { taskId: 't1', startedAt: iso(5.01) })).status).toBe(400);
		expect((await create('me', { taskId: 't1', startedAt: iso(5) })).status).toBe(201);
	});

	it('400 when duration exceeds 12 h; exactly 12 h is allowed', async () => {
		const tooLong = await create('me', {
			taskId: 't1',
			startedAt: iso(-12 * 60 - 1),
			endedAt: iso(0)
		});
		expect(tooLong.status).toBe(400);
		const ok = await create('me', { taskId: 't1', startedAt: iso(-12 * 60), endedAt: iso(0) });
		expect(ok.status).toBe(201);
	});

	it('400 on missing/garbage fields', async () => {
		expect((await create('me', { startedAt: iso(0) })).status).toBe(400);
		expect((await create('me', { taskId: 't1' })).status).toBe(400);
		expect((await create('me', { taskId: 't1', startedAt: 'nope' })).status).toBe(400);
		expect((await create('me', { taskId: 't1', startedAt: iso(-5), endedAt: 42 })).status).toBe(
			400
		);
		expect((await create('me', null)).status).toBe(400);
	});

	it('404 when the task is not one the caller can see', async () => {
		expect((await create('me', { taskId: 'tOther', startedAt: iso(0) })).status).toBe(404);
		expect((await create('me', { taskId: 'missing', startedAt: iso(0) })).status).toBe(404);
	});

	it('409 with openSessionId when an open session already runs; a finished POST still succeeds', async () => {
		const first = await (await create('me', { taskId: 't1', startedAt: iso(-5) })).json();
		const second = await create('me', { taskId: 't2', startedAt: iso(0) });
		expect(second.status).toBe(409);
		expect((await second.json()).openSessionId).toBe(first.session.id);
		const offline = await create('me', { taskId: 't2', startedAt: iso(-60), endedAt: iso(-50) });
		expect(offline.status).toBe(201);
	});

	it('one-open rule is per user', async () => {
		holder.store.grant('t1', 'other');
		await create('me', { taskId: 't1', startedAt: iso(0) });
		expect((await create('other', { taskId: 't1', startedAt: iso(0) })).status).toBe(201);
	});
});

describe('PATCH /api/taskfocus/sessions/{id}', () => {
	it('200 closes an open session', async () => {
		const { session } = await (await create('me', { taskId: 't1', startedAt: iso(-25) })).json();
		const res = await PATCH(ev('me', { id: session.id, body: { endedAt: iso(0) } }));
		expect(res.status).toBe(200);
		expect((await res.json()).session).toMatchObject({ id: session.id, endedAt: iso(0) });
	});

	it('a retried stop on a closed, unabsorbed session succeeds (overwrites endedAt)', async () => {
		const { session } = await (
			await create('me', { taskId: 't1', startedAt: iso(-25), endedAt: iso(-5) })
		).json();
		const res = await PATCH(ev('me', { id: session.id, body: { endedAt: iso(0) } }));
		expect(res.status).toBe(200);
		expect((await res.json()).session.endedAt).toBe(iso(0));
	});

	it('404 when not yours or unknown', async () => {
		const { session } = await (await create('me', { taskId: 't1', startedAt: iso(-5) })).json();
		expect((await PATCH(ev('other', { id: session.id, body: { endedAt: iso(0) } }))).status).toBe(
			404
		);
		expect((await PATCH(ev('me', { id: 'nope', body: { endedAt: iso(0) } }))).status).toBe(404);
	});

	it('409 when already absorbed', async () => {
		const { session } = await (
			await create('me', { taskId: 't1', startedAt: iso(-25), endedAt: iso(-5) })
		).json();
		await ABSORB(ev('me', { id: session.id }));
		expect((await PATCH(ev('me', { id: session.id, body: { endedAt: iso(0) } }))).status).toBe(409);
	});

	it('400 on endedAt <= startedAt, > 12 h, or missing', async () => {
		const { session } = await (await create('me', { taskId: 't1', startedAt: iso(-5) })).json();
		expect((await PATCH(ev('me', { id: session.id, body: { endedAt: iso(-5) } }))).status).toBe(
			400
		);
		expect(
			(await PATCH(ev('me', { id: session.id, body: { endedAt: iso(12 * 60) } }))).status
		).toBe(400);
		expect((await PATCH(ev('me', { id: session.id, body: {} }))).status).toBe(400);
	});

	it('closing frees the one-open slot', async () => {
		const { session } = await (await create('me', { taskId: 't1', startedAt: iso(-5) })).json();
		await PATCH(ev('me', { id: session.id, body: { endedAt: iso(0) } }));
		expect((await create('me', { taskId: 't2', startedAt: iso(0) })).status).toBe(201);
	});
});

describe('DELETE /api/taskfocus/sessions/{id}', () => {
	it('200 discards an unabsorbed session; a repeat is 404 (= done)', async () => {
		const { session } = await (await create('me', { taskId: 't1', startedAt: iso(-5) })).json();
		const res = await DELETE(ev('me', { id: session.id }));
		expect(res.status).toBe(200);
		expect(holder.store.rows).toHaveLength(0);
		expect((await DELETE(ev('me', { id: session.id }))).status).toBe(404);
	});

	it("404 for another user's session, which survives", async () => {
		const { session } = await (await create('me', { taskId: 't1', startedAt: iso(-5) })).json();
		expect((await DELETE(ev('other', { id: session.id }))).status).toBe(404);
		expect(holder.store.rows).toHaveLength(1);
	});

	it('409 for an absorbed session (it is desktop history now)', async () => {
		const { session } = await (
			await create('me', { taskId: 't1', startedAt: iso(-25), endedAt: iso(-5) })
		).json();
		await ABSORB(ev('me', { id: session.id }));
		expect((await DELETE(ev('me', { id: session.id }))).status).toBe(409);
	});
});

describe('GET /api/taskfocus/sessions?unabsorbed=1', () => {
	it('closed + unabsorbed only, caller only, oldest first, five fields', async () => {
		holder.store.grant('t1', 'other');
		const late = await (
			await create('me', { taskId: 't1', startedAt: iso(-30), endedAt: iso(-20) })
		).json();
		const early = await (
			await create('me', { taskId: 't2', startedAt: iso(-90), endedAt: iso(-80) })
		).json();
		const absorbed = await (
			await create('me', { taskId: 't1', startedAt: iso(-200), endedAt: iso(-190) })
		).json();
		await ABSORB(ev('me', { id: absorbed.session.id }));
		await create('me', { taskId: 't1', startedAt: iso(-1) }); // open
		await create('other', { taskId: 't1', startedAt: iso(-60), endedAt: iso(-50) });

		const res = await GET(ev('me', { query: '?unabsorbed=1' }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			sessions: [
				{
					id: early.session.id,
					taskId: 't2',
					startedAt: iso(-90),
					endedAt: iso(-80),
					source: 'phone'
				},
				{
					id: late.session.id,
					taskId: 't1',
					startedAt: iso(-30),
					endedAt: iso(-20),
					source: 'phone'
				}
			]
		});
	});

	it('caps at 200', async () => {
		for (let i = 0; i < 205; i++) {
			await create('me', {
				taskId: 't1',
				startedAt: iso(-1000 + i * 2),
				endedAt: iso(-999 + i * 2)
			});
		}
		const body = await (await GET(ev('me', { query: '?unabsorbed=1' }))).json();
		expect(body.sessions).toHaveLength(200);
		expect(body.sessions[0].startedAt).toBe(iso(-1000));
	});

	it('400 without ?unabsorbed=1', async () => {
		expect((await GET(ev('me'))).status).toBe(400);
	});
});

describe('POST /api/taskfocus/sessions/{id}/absorb', () => {
	it('200 marks a closed session absorbed; repeat is 200 (idempotent)', async () => {
		const { session } = await (
			await create('me', { taskId: 't1', startedAt: iso(-25), endedAt: iso(-5) })
		).json();
		const first = await ABSORB(ev('me', { id: session.id }));
		expect(first.status).toBe(200);
		const absorbedAt = (await first.json()).session.absorbedAt;
		expect(absorbedAt).toBe(NOW.toISOString());
		vi.setSystemTime(new Date(NOW.getTime() + 60000));
		const again = await ABSORB(ev('me', { id: session.id }));
		expect(again.status).toBe(200);
		expect((await again.json()).session.absorbedAt).toBe(absorbedAt);
	});

	it('404 for unknown or another user', async () => {
		const { session } = await (
			await create('me', { taskId: 't1', startedAt: iso(-25), endedAt: iso(-5) })
		).json();
		expect((await ABSORB(ev('other', { id: session.id }))).status).toBe(404);
		expect((await ABSORB(ev('me', { id: 'nope' }))).status).toBe(404);
	});

	it('409 for an open session (only closed sessions can be absorbed)', async () => {
		const { session } = await (await create('me', { taskId: 't1', startedAt: iso(-5) })).json();
		expect((await ABSORB(ev('me', { id: session.id }))).status).toBe(409);
		expect(holder.store.rows[0].absorbedAt).toBeNull();
	});
});
