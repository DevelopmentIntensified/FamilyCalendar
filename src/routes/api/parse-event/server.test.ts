import { describe, it, expect, vi, beforeEach } from 'vitest';

// #264: authenticated calls look up the viewer's zone (a userSettings query);
// stub it so this suite never needs a live Postgres.
// oxlint-disable-next-line anti-slop/no-module-mocking -- the viewer's zone is a settings lookup, not this contract.
vi.mock('$lib/server/utils/userTimezone', () => ({
	getUserZone: vi.fn(async () => undefined)
}));

import { POST, type ParseEventDeps } from './+server';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';

// Untyped vi.fn()s: fakes flow into the typed deps seam, so the SUT stays
// type-checked while mocks accept any resolved value without casts.
const chatJson = vi.fn();
const llmConfigured = vi.fn();
const canUseAiFeature = vi.fn();
const getUserSubscription = vi.fn();
const recordAiUsage = vi.fn();

function makeDeps(overrides?: Partial<ParseEventDeps>): ParseEventDeps {
	return {
		chatJson,
		llmConfigured,
		canUseAiFeature,
		getUserSubscription,
		recordAiUsage,
		...overrides
	};
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
	// The limiter's buckets are module scope; a case that exhausts the window
	// must not leak that state into the next one.
	clearRateLimitState();
	// Under-cap by default: the cap tests override this explicitly.
	canUseAiFeature.mockResolvedValue({ allowed: true, remaining: 42 });
	// No paid plan unless a case says otherwise: callers are on the free cap.
	getUserSubscription.mockResolvedValue({ tierName: 'free' });
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

describe('POST /api/parse-event — plan-aware short-window cap (issue 317)', () => {
	const send = (user = { id: 'user-1' }, useCloud?: boolean) =>
		POST(mockEvent({ input: 'dinner tomorrow at 6pm', useCloud }, user), makeDeps());

	function mockCloud(): void {
		llmConfigured.mockReturnValue(true);
		chatJson.mockResolvedValue({ title: 'Dinner', date: '2026-09-07' });
	}

	it('keeps the free tier at 20 cloud parses per 5 minutes, then falls back to regex', async () => {
		mockCloud();
		getUserSubscription.mockResolvedValue({ tierName: 'free' });

		for (let i = 0; i < 20; i++) {
			const body = await (await send()).json();
			expect(body.method).toBe('cloud');
		}

		const over = await send();

		// Over the short-window cap is silent: the local parser answers, no 429
		// (the monthly AI cap is the only user-facing refusal).
		expect(over.status).toBe(200);
		expect((await over.json()).method).toBe('regex');
		expect(chatJson).toHaveBeenCalledTimes(20);
	});

	it('never short-window caps a paid tier', async () => {
		mockCloud();
		getUserSubscription.mockResolvedValue({ tierName: 'family_master' });

		// Well past the free cap of 20 and the old paid cap of 60.
		for (let i = 0; i < 80; i++) {
			const body = await (await send()).json();
			expect(body.method).toBe('cloud');
		}

		expect(chatJson).toHaveBeenCalledTimes(80);
		expect(getUserSubscription).toHaveBeenCalledWith('user-1');
	});

	it('treats a caller with no subscription row as free', async () => {
		mockCloud();
		getUserSubscription.mockResolvedValue(null);

		for (let i = 0; i < 20; i++) await send();

		expect((await (await send()).json()).method).toBe('regex');
		expect(chatJson).toHaveBeenCalledTimes(20);
	});

	it('never reads the plan for anonymous or cloud-opted-out callers', async () => {
		mockCloud();

		await POST(mockEvent({ input: 'dinner tomorrow at 6pm' }), makeDeps());
		await send({ id: 'user-1' }, false);

		expect(getUserSubscription).not.toHaveBeenCalled();
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
