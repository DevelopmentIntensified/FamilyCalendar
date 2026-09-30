import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, type MemberSearchDeps } from './+server';

/**
 * The create-page member search door (issue 100).
 *
 * It is a separate endpoint on purpose. The invite-flow lookup refuses any
 * caller who is not already a member of the family in the query string, and on
 * the create page there is no family to be a member of; and its matching is
 * exact-by-design, because a wildcard scan there would let any family member
 * enumerate every verified user. Loosening it there was not an option, so this
 * door carries its own floor, its own cap and its own rate limit.
 */

const find = vi.fn();
const gate = vi.fn(() => true);

/** A test double for the RequestEvent: the handler reads locals, url and headers. */
function event(q: string | null, options: { userId?: string | null; exclude?: string[] } = {}) {
	const url = new URL('http://localhost/api/family/member-search');
	if (q !== null) url.searchParams.set('q', q);
	for (const id of options.exclude ?? []) url.searchParams.append('exclude', id);

	return {
		locals: { user: options.userId === null ? null : { id: options.userId ?? 'me' } },
		request: { headers: { get: () => 'test-ip' } },
		url
	} as never;
}

function deps(): MemberSearchDeps {
	// SAFETY: the fakes stand in for the injected finder and rate-limit gate;
	// both are narrow function seams the handler only calls.
	return { find, gate } as unknown as MemberSearchDeps;
}

beforeEach(() => {
	vi.clearAllMocks();
	gate.mockReturnValue(true);
	find.mockResolvedValue({ ok: true, users: [] });
});

describe('GET /api/family/member-search — its own door, its own bounds', () => {
	it('refuses an anonymous caller and never reaches the search', async () => {
		const response = await GET(event('ann', { userId: null }), deps());

		expect(response.status).toBe(401);
		expect(find).not.toHaveBeenCalled();
	});

	it('works with no family in the query at all — the create page has none yet', async () => {
		const response = await GET(event('ann'), deps());

		expect(response.status).toBe(200);
		// SAFETY: the stub records the call it was handed; reading args[1] is the
		// whole point of the assertion.
		const options = find.mock.calls[0][1] as { callerId: string };
		expect(options.callerId).toBe('me');
	});

	it('returns the matches it found', async () => {
		find.mockResolvedValue({
			ok: true,
			users: [{ id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'ann@x.com' }]
		});

		const response = await GET(event('ann'), deps());

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			users: [{ id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'ann@x.com' }]
		});
	});

	it('refuses a single letter at the door, before any query is spent', async () => {
		const response = await GET(event('a'), deps());

		expect(response.status).toBe(400);
		expect(find).not.toHaveBeenCalled();
	});

	it('refuses an over-long term at the door too', async () => {
		const response = await GET(event('a'.repeat(200)), deps());

		expect(response.status).toBe(400);
		expect(find).not.toHaveBeenCalled();
	});

	it('keeps the caller and the already-picked out of the search', async () => {
		await GET(event('ann', { exclude: ['picked-1', 'picked-2'] }), deps());

		// SAFETY: the stub records the options object it was handed.
		const options = find.mock.calls[0][1] as { callerId: string; excludeUserIds: string[] };
		expect(options.excludeUserIds).toEqual(['picked-1', 'picked-2']);
	});

	it('rate-limits itself, and refuses before spending a query', async () => {
		gate.mockReturnValue(false);

		const response = await GET(event('ann'), deps());

		expect(response.status).toBe(429);
		expect(gate).toHaveBeenCalledTimes(1);
		expect(find).not.toHaveBeenCalled();
	});

	it('still answers safely if the search itself refuses a term', async () => {
		find.mockResolvedValue({ ok: false, reason: 'too-short' });

		const response = await GET(event('ann'), deps());

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ users: [] });
	});
});
