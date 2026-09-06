import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type ParseEventDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const chatJson = vi.fn();
const llmConfigured = vi.fn();

function makeDeps(overrides?: Partial<ParseEventDeps>): ParseEventDeps {
	return { chatJson, llmConfigured, ...overrides };
}

function mockEvent(body: { input: string; useCloud?: boolean }, user?: { id: string }) {
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
	// One single-event input; regex path always parses it locally.
});

describe('POST /api/parse-event', () => {
	it('never calls the paid LLM for unauthenticated callers, even when configured', async () => {
		llmConfigured.mockReturnValue(true);
		chatJson.mockResolvedValue({ title: 'Dinner', date: '2026-09-07' });

		const response = await POST(mockEvent({ input: 'dinner tomorrow at 6pm' }), makeDeps());

		const body = await response.json();

		expect(chatJson).not.toHaveBeenCalled();
		expect(body.method).not.toBe('cloud');
	});

	it('keeps the cloud path for authenticated callers', async () => {
		llmConfigured.mockReturnValue(true);
		chatJson.mockResolvedValue({ title: 'Dinner', date: '2026-09-07' });

		const response = await POST(
			mockEvent({ input: 'dinner tomorrow at 6pm' }, { id: 'user-1' }),
			makeDeps()
		);

		const body = await response.json();

		expect(chatJson).toHaveBeenCalledTimes(1);
		expect(body.method).toBe('cloud');
		expect(body.parsed).toEqual({ title: 'Dinner', date: '2026-09-07' });
	});

	it('falls back to regex for authenticated callers when the LLM returns nothing', async () => {
		llmConfigured.mockReturnValue(true);
		chatJson.mockResolvedValue(null);

		const response = await POST(
			mockEvent({ input: 'dinner tomorrow at 6pm' }, { id: 'user-1' }),
			makeDeps()
		);

		const body = await response.json();

		expect(body.method).toBe('regex');
	});

	it('never calls the LLM when it is unconfigured (authenticated too)', async () => {
		llmConfigured.mockReturnValue(false);

		const response = await POST(
			mockEvent({ input: 'dinner tomorrow at 6pm' }, { id: 'user-1' }),
			makeDeps()
		);

		const body = await response.json();

		expect(chatJson).not.toHaveBeenCalled();
		expect(body.method).toBe('regex');
	});
});
