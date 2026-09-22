import { describe, it, expect, vi, beforeEach } from 'vitest';

// hooks.server.ts pulls the real db module at import (lazy client, no
// connection) — dummy URL + migrations off keep the import side-effect free.
vi.hoisted(() => {
	process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5433/familycalendar_test';
	process.env.DATABASE_DISABLE_MIGRATIONS = '1';
});

/**
 * Bearer → task-permission composition: the identity hooks.server.ts
 * resolves from the token must flow into the REAL owner-scoped write
 * (`updateTask` constrains `where(id AND userId)` in SQL) — so user A's
 * token can never rewrite user B's task, while B's own token can.
 * Route seams stay real; only the drizzle builder is scripted.
 */
const state = vi.hoisted(() => ({
	selectQueue: [] as unknown[][],
	txReturn: [] as Record<string, unknown>[]
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(state.selectQueue.shift() ?? [])
			})
		}),
		update: () => ({
			set: () => ({
				where: () => ({ returning: () => Promise.resolve([]) })
			})
		}),
		delete: () => ({ where: () => Promise.resolve([]) }),
		insert: () => ({ values: () => Promise.resolve([]) }),
		transaction: async (
			fn: (tx: unknown) => Promise<unknown>
		) =>
			fn({
				update: () => ({
					set: () => ({
						where: () => ({ returning: () => Promise.resolve(state.txReturn) })
					})
				}),
				select: () => ({
					from: () => ({
						where: () => Promise.resolve(state.selectQueue.shift() ?? [])
					})
				}),
				delete: () => ({ where: () => Promise.resolve([]) }),
				insert: () => ({ values: () => Promise.resolve([]) })
			})
	}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- pins the Bearer seam; the cookie path stays unreached (no cookie in these events).
vi.mock('$lib/server/db/actions/apiTokens', () => ({
	getUserForApiToken: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted zone; the real module reads user settings from the DB.
vi.mock('$lib/server/utils/userTimezone', () => ({
	getUserZone: vi.fn(async () => 'UTC'),
	zonedNow: vi.fn()
}));

import { handle } from '../../../../hooks.server';
import { PUT } from './+server';
import { getUserForApiToken } from '$lib/server/db/actions/apiTokens';

const mockedLookup = vi.mocked(getUserForApiToken);

function bearerEvent(token: string) {
	const headers = new Headers();
	headers.set('authorization', `Bearer ${token}`);
	// SAFETY: test double — the handle chain only reads url/request/cookies/locals.
	return {
		url: { pathname: '/api/tasks/t1', host: 'familyplanz.com' },
		request: { method: 'PUT', headers },
		cookies: { get: () => undefined },
		locals: { user: null, session: null }
	};
}

/** Runs the Bearer request through hooks, then feeds the authed locals to PUT. */
async function putAsBearer(token: string, body: Record<string, unknown>) {
	const event = bearerEvent(token);
	// SAFETY: boundary casts — handle only reads the stubbed fields above.
	const resolveCapture = vi.fn(async (e: never) => new Response('captured'));
	const res = await handle({ event: event as never, resolve: resolveCapture as never });
	if (resolveCapture.mock.calls.length === 0) return { hookRes: res as Response, putRes: null };
	const authed = resolveCapture.mock.calls[0][0] as {
		locals: { user: { id: string }; session: null };
	};
	const putRes = await PUT({
		locals: authed.locals,
		url: new URL('http://localhost/api/tasks/t1'),
		request: { url: 'http://localhost/api/tasks/t1', json: async () => body }
	} as never);
	return { hookRes: null, putRes: putRes as Response };
}

beforeEach(() => {
	state.selectQueue = [];
	state.txReturn = [];
	vi.clearAllMocks();
});

describe('Bearer PUT /api/tasks/[id] — cross-user isolation', () => {
	it("user A's token cannot rewrite user B's task (owner-scoped write matches nothing)", async () => {
		mockedLookup.mockResolvedValue({ id: 'user-A' } as never);
		state.txReturn = []; // WHERE (id AND userId='user-A') hits no row

		const { putRes } = await putAsBearer('fp_token_of_A', { title: 'Hacked' });

		expect(mockedLookup).toHaveBeenCalledWith('fp_token_of_A');
		expect(putRes?.status).toBe(404);
		expect(await putRes?.json()).toEqual({ error: 'Task not found' });
	});

	it("user B's own token rewrites user B's task (cookie parity, no session)", async () => {
		mockedLookup.mockResolvedValue({ id: 'user-B' } as never);
		state.txReturn = [{ id: 't1', userId: 'user-B', title: 'Hacked' }];
		state.selectQueue = [[ /* attachTags: no tags */]];

		const { putRes } = await putAsBearer('fp_token_of_B', { title: 'Hacked' });

		expect(putRes?.status).toBe(200);
		const body = (await putRes?.json()) as { success: boolean; task: { title: string } };
		expect(body).toMatchObject({ success: true, task: { title: 'Hacked' } });
	});

	it('a revoked token 401s at the hook and never reaches the route', async () => {
		mockedLookup.mockResolvedValue(null); // row gone = revoked

		const { hookRes, putRes } = await putAsBearer('fp_revoked', { title: 'Hacked' });

		expect(putRes).toBeNull();
		expect(hookRes?.status).toBe(401);
		expect(await hookRes?.json()).toEqual({ error: 'Unauthorized' });
	});
});
