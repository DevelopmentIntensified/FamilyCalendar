import { describe, it, expect, vi, beforeEach } from 'vitest';

// hooks.server.ts pulls the real db module at import (lazy client, no
// connection) — dummy URL + migrations off keep the import side-effect free.
vi.hoisted(() => {
	process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5433/familycalendar_test';
	process.env.DATABASE_DISABLE_MIGRATIONS = '1';
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- pins the Bearer seam; cookie/lucia path stays real but unreached (no cookie in these events).
vi.mock('$lib/server/db/actions/apiTokens', () => ({
	getUserForApiToken: vi.fn()
}));

import { handle } from './hooks.server';
import { getUserForApiToken } from '$lib/server/db/actions/apiTokens';

const mockedLookup = vi.mocked(getUserForApiToken);

function makeEvent(pathname: string, opts: { auth?: string; method?: string } = {}) {
	const headers = new Headers();
	if (opts.auth) headers.set('authorization', opts.auth);
	return {
		url: { pathname, host: 'familyplanz.com' },
		request: { method: opts.method ?? 'GET', headers },
		cookies: { get: () => undefined },
		locals: { user: null as { id: string } | null, session: null }
	};
}

// The handle chain only reads url/request/cookies/locals — cast at the
// boundary instead of inside makeEvent so the tests keep typed locals.
function handleEvent(event: ReturnType<typeof makeEvent>) {
	return handle({ event: event as never, resolve: resolveFn as never });
}

const resolveFn = vi.fn(async (e: { locals: { user: { id: string } | null } }) => {
	return new Response('ok:' + (e.locals.user?.id ?? 'anon'));
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe('hooks Bearer auth (TaskFocus API tokens)', () => {
	it('authenticates a valid Bearer token on /api/* with no session', async () => {
		mockedLookup.mockResolvedValue({ id: 'user-1' } as never);
		const event = makeEvent('/api/tasks', { auth: 'Bearer fp_good' });

		const res = await handleEvent(event);

		expect(mockedLookup).toHaveBeenCalledWith('fp_good');
		expect(event.locals.user).toEqual({ id: 'user-1' });
		expect(event.locals.session).toBeNull();
		expect(await res.text()).toBe('ok:user-1');
	});

	it('returns 401 JSON for an invalid Bearer token without resolving', async () => {
		mockedLookup.mockResolvedValue(null);
		const event = makeEvent('/api/tasks', { auth: 'Bearer fp_bad' });

		const res = await handleEvent(event);

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Unauthorized' });
		expect(resolveFn).not.toHaveBeenCalled();
	});

	it('leaves the cookie path untouched when no Bearer header is present', async () => {
		const event = makeEvent('/api/tasks');

		const res = await handleEvent(event);

		expect(mockedLookup).not.toHaveBeenCalled();
		expect(event.locals.user).toBeNull();
		expect(await res.text()).toBe('ok:anon');
	});

	it('ignores Bearer headers off /api/* (page routes stay cookie-only)', async () => {
		const event = makeEvent('/calendar', { auth: 'Bearer fp_good' });

		await handleEvent(event);

		expect(mockedLookup).not.toHaveBeenCalled();
		expect(event.locals.user).toBeNull();
	});
});
