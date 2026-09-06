import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type UnsubscribeDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const removeSubscription = vi.fn();

const deps: UnsubscribeDeps = { removeSubscription };

function mockEvent(body: { endpoint?: string }, user?: { id: string }) {
	return (
		// SAFETY: test double — POST only reads request.json() and locals.user.
		{
			request: { json: () => Promise.resolve(body) },
			locals: user ? { user } : {}
		} as never
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /api/push/unsubscribe', () => {
	it('returns 401 for unauthenticated caller', async () => {
		const response = await POST(mockEvent({ endpoint: 'https://push.example/1' }), deps);

		expect(response.status).toBe(401);
		expect(removeSubscription).not.toHaveBeenCalled();
	});

	it('removes only the caller-scoped subscription when authenticated', async () => {
		const response = await POST(
			mockEvent({ endpoint: 'https://push.example/1' }, { id: 'user-1' }),
			deps
		);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(removeSubscription).toHaveBeenCalledWith('user-1', 'https://push.example/1');
	});

	it('returns 400 for a missing endpoint', async () => {
		const response = await POST(mockEvent({}, { id: 'user-1' }), deps);

		expect(response.status).toBe(400);
		expect(removeSubscription).not.toHaveBeenCalled();
	});
});
