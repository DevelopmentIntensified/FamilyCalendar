import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, type ParseEventDeps } from './+server';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const chatJson = vi.fn();
const llmConfigured = vi.fn();
const canUseAiFeature = vi.fn();
const recordAiUsage = vi.fn();

function makeDeps(overrides?: Partial<ParseEventDeps>): ParseEventDeps {
	return { chatJson, llmConfigured, canUseAiFeature, recordAiUsage, ...overrides };
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
	// Under-cap by default: the cap tests override this explicitly.
	canUseAiFeature.mockResolvedValue({ allowed: true, remaining: 42 });
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

	it('refuses over-cap callers with 429 before any vendor call', async () => {
		llmConfigured.mockReturnValue(true);
		canUseAiFeature.mockResolvedValue({
			allowed: false,
			reason: 'AI feature limit reached (50 per month). Upgrade to unlock unlimited AI.',
			remaining: 0
		});

		const response = await POST(
			mockEvent({ input: 'dinner tomorrow at 6pm' }, { id: 'user-1' }),
			makeDeps()
		);

		const body = await response.json();

		expect(response.status).toBe(429);
		expect(body.error).toContain('limit reached');
		expect(chatJson).not.toHaveBeenCalled(); // zero vendor spend
	});

	it('skips the cap check entirely when the client opted out of cloud parsing', async () => {
		// The cap only gates the paid path: cloud-off callers stay on the free
		// regex parser and are never charged nor refused.
		llmConfigured.mockReturnValue(true);
		canUseAiFeature.mockResolvedValue({ allowed: false, reason: 'capped', remaining: 0 });

		const response = await POST(
			mockEvent({ input: 'dinner tomorrow at 6pm', useCloud: false }, { id: 'user-1' }),
			makeDeps()
		);

		const body = await response.json();

		expect(response.status).toBe(200);
		expect(canUseAiFeature).not.toHaveBeenCalled();
		expect(chatJson).not.toHaveBeenCalled();
	});

	it('records AI usage after a successful cloud parse', async () => {
		llmConfigured.mockReturnValue(true);
		chatJson.mockResolvedValue({ title: 'Dinner', date: '2026-09-07' });

		await POST(mockEvent({ input: 'dinner tomorrow at 6pm' }, { id: 'user-1' }), makeDeps());

		expect(canUseAiFeature).toHaveBeenCalledWith('user-1');
		expect(recordAiUsage).toHaveBeenCalledTimes(1);
		expect(recordAiUsage).toHaveBeenCalledWith('user-1');
	});

	it('records usage even when the LLM returns nothing (the request is still billed)', async () => {
		llmConfigured.mockReturnValue(true);
		chatJson.mockResolvedValue(null);

		await POST(mockEvent({ input: 'dinner tomorrow at 6pm' }, { id: 'user-1' }), makeDeps());

		expect(recordAiUsage).toHaveBeenCalledTimes(1);
		// A null vendor response falls through to the regex fallback.
		expect(chatJson).toHaveBeenCalledTimes(1);
	});
});

describe('POST /api/parse-event — bare leading meridiem (issue 107)', () => {
	it('keeps the leading PM in the quick-add regex parse', async () => {
		llmConfigured.mockReturnValue(false);

		const response = await POST(
			mockEvent({
				input:
					'PM Certification 4 Days Classroom Training in Lynchburg, VA Tue, May 26 • 9:00 AM Lynchburg, VA From $1,659.95'
			}),
			makeDeps()
		);

		const body = await response.json();

		expect(body.method).toBe('regex');
		expect(body.parsed.title).toBe('PM Certification 4 Days Classroom Training');
		expect(body.parsed.location).toBe('Lynchburg');
		expect(body.parsed.startTime).toBe('09:00');
	});

	it('keeps a lowercase leading pm with an explicit time later in the phrase', async () => {
		llmConfigured.mockReturnValue(false);

		const response = await POST(
			mockEvent({ input: 'pm dentist monday 3 pm', useCloud: false }),
			makeDeps()
		);

		const body = await response.json();

		expect(body.parsed.title).toBe('pm dentist');
		expect(body.parsed.startTime).toBe('15:00');
	});
});
