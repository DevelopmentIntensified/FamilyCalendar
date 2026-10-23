import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { actions, type UpdateEmailDeps } from './+page.server';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';
import { getUserSettings, updateUserSettings, createUserSettings } from '$lib/server/db/actions/userSettings';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';

// oxlint-disable-next-line anti-slop/no-module-mocking -- settings/calendarScope are DB-backed seams this route action reads directly; there is no deps parameter (Actions type erases it).
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(),
	updateUserSettings: vi.fn(),
	createUserSettings: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- same module owns the real scope read; stubbing it is the only way to fix calendar access without Postgres.
vi.mock('$lib/server/db/actions/calendarScope', () => ({
	getAccessibleCalendarIds: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- consent recording runs best-effort after the write; irrelevant to the access check under test.
vi.mock('$lib/server/services/adConsentService', () => ({
	recordAdConsentChange: vi.fn(),
	getAdConsentRecords: vi.fn().mockResolvedValue([])
}));

type RequestResult = Record<string, unknown> | void;

// SAFETY: SvelteKit's Actions type erases the handler's optional deps
// parameter; the real handler accepts it (tests call it through this cast).
const callUpdateEmail = actions.updateEmail as (
	event: RequestEvent,
	deps: UpdateEmailDeps
) => Promise<RequestResult>;

type DepsMocks = {
	deps: UpdateEmailDeps;
	getUser: Mock;
	sendEmail: Mock;
	createJwt: Mock;
	deleteCodesByEmail: Mock;
	createCode: Mock;
};

function makeDeps(overrides: Partial<UpdateEmailDeps> = {}): DepsMocks {
	const getUser = vi.fn().mockResolvedValue({
		id: 'u-1',
		email: 'delivered+email-change-current@resend.dev',
		firstName: 'Pat',
		lastName: 'Smith'
	});
	const sendEmail = vi.fn().mockResolvedValue({ ok: true });
	const createJwt = vi.fn().mockResolvedValue('mock.jwt.token');
	const deleteCodesByEmail = vi.fn();
	const createCode = vi.fn();
	const deps: UpdateEmailDeps = {
		getUser,
		sendEmail,
		createJwt,
		baseUrl: 'http://test.com',
		fromEmail: 'noreply@test.com',
		emailSecret: new TextEncoder().encode('test-secret-1234567890'),
		deleteCodesByEmail,
		createCode,
		...overrides
	};
	return { deps, getUser, sendEmail, createJwt, deleteCodesByEmail, createCode };
}

function mockEvent(email: string, userId = `u-${Math.random().toString(36).slice(2, 10)}`, ip = '10.0.0.1') {
	const formData = new FormData();
	formData.set('email', email);
	const headers = {
		get: (name: string) => (name === 'x-forwarded-for' ? ip : null)
	};
	// SAFETY: test double — the action only reads request.formData() and
	// request.headers (for rate limiting), plus locals.user.
	return { request: { formData: () => Promise.resolve(formData), headers }, locals: { user: { id: userId } } } as never;
}

function failureOf(result: RequestResult): { status: number; data: Record<string, unknown> } {
	// SAFETY: failing branches return fail(...), which structurally carries
	// status/data (same narrowing style as the claim page test).
	return result as { status: number; data: Record<string, unknown> };
}

beforeEach(() => {
	clearRateLimitState();
});

describe('updateEmail action — Oct-hardening survival (#196 slice 4)', () => {
	it('throttles the fourth send per user within 15 minutes (3/15m, user-bound key)', async () => {
		const { deps, sendEmail } = makeDeps();

		for (let i = 0; i < 3; i++) {
			await callUpdateEmail(mockEvent('delivered+email-change@resend.dev', 'throttle-user', '10.0.0.7'), deps);
		}
		const fourth = await callUpdateEmail(mockEvent('delivered+email-change@resend.dev', 'throttle-user', '10.0.0.7'), deps);

		expect(failureOf(fourth).status).toBe(429);
		expect(sendEmail).toHaveBeenCalledTimes(3);
	});

	it('guests (no email yet) are told to claim, never mailed', async () => {
		const { deps, sendEmail } = makeDeps({
			getUser: vi.fn().mockResolvedValue({ id: 'u-g', email: null })
		});

		const result = await callUpdateEmail(mockEvent('delivered+email-change-guest@resend.dev'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(failureOf(result).data.guestNeedsClaim).toBe(true);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('binds the code to the current address and the new one (email_change + pendingEmail), wiping stale codes first', async () => {
		const { deps, createJwt, deleteCodesByEmail, createCode, sendEmail } = makeDeps();

		const result = await callUpdateEmail(mockEvent('delivered+email-change-new@resend.dev', 'binding-user'), deps);
		expect(result).toMatchObject({ success: true });

		expect(deleteCodesByEmail).toHaveBeenCalledWith('delivered+email-change-current@resend.dev');
		expect(createJwt).toHaveBeenCalledWith(
			'HS256',
			deps.emailSecret,
			expect.objectContaining({ pendingEmail: 'delivered+email-change-new@resend.dev', code: expect.any(String) }),
			expect.objectContaining({ expiresIn: expect.anything() })
		);
		expect(createCode.mock.calls[0]?.[0]).toMatchObject({
			type: 'email_change',
			email: 'delivered+email-change-current@resend.dev',
			pendingEmail: 'delivered+email-change-new@resend.dev',
			firstName: 'Pat',
			lastName: 'Smith'
		});
		expect(deleteCodesByEmail.mock.invocationCallOrder[0]).toBeLessThan(createCode.mock.invocationCallOrder[0]);

		expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({
			to: 'delivered+email-change-new@resend.dev',
			from: deps.fromEmail
		});
	});

	it('rejects a change to the currently-used address (no self-loop codes)', async () => {
		const { deps, sendEmail, createCode } = makeDeps();

		const result = await callUpdateEmail(mockEvent('delivered+email-change-current@resend.dev'), deps);

		expect(failureOf(result).status).toBe(400);
		expect(sendEmail).not.toHaveBeenCalled();
		expect(createCode).not.toHaveBeenCalled();
	});
});

describe('saveCalendarSettings — defaultCalendarId access check (issue 167)', () => {
	function calendarEvent(fields: Record<string, string>) {
		const formData = new FormData();
		formData.set('weekStart', 'sunday');
		formData.set('timeZone', 'UTC');
		formData.set('color', '#3b82f6');
		formData.set('defaultView', 'dayView');
		formData.set('verseTranslation', 'esv');
		formData.set('syncEventsToFamilyCalendar', 'false');
		formData.set('autoParseEventDetails', 'false');
		formData.set('showDailyVerse', 'false');
		formData.set('showAdsAsEvents', 'false');
		for (const [key, value] of Object.entries(fields)) formData.set(key, value);
		// SAFETY: test double — the action only reads request.formData() and locals.user.
		return {
			request: { formData: () => Promise.resolve(formData) },
			locals: { user: { id: 'cal-user' } }
		} as never;
	}

	// SAFETY: SvelteKit's Actions type erases the handler's signature; tests
	// call it with a plain event double (same style as callUpdateEmail above).
	const callSave = actions.saveCalendarSettings as (
		event: RequestEvent
	) => Promise<RequestResult>;

	it('rejects a foreign calendar id with a form error and writes nothing', async () => {
		// SAFETY: the settings bindings are vi.mock factory mocks; their real
		// action types cannot express the stub shapes used here.
		(getUserSettings as Mock).mockResolvedValue(null);
		// SAFETY: as above — factory mock, not the real action.
		(updateUserSettings as Mock).mockResolvedValue(undefined);
		vi.mocked(getAccessibleCalendarIds).mockResolvedValue(['cal-own']);

		const result = await callSave(
			calendarEvent({ defaultCalendarId: 'cal-someone-else' })
		);

		expect(failureOf(result).status).toBe(400);
		expect(failureOf(result).data.success).toBe(false);
		expect(createUserSettings).not.toHaveBeenCalled();
		expect(updateUserSettings).not.toHaveBeenCalled();
	});

	it('rejects a nonexistent calendar id with a form error and writes nothing', async () => {
		// SAFETY: see the foreign-id test above — factory mocks, not real actions.
		(getUserSettings as Mock).mockResolvedValue(null);
		// SAFETY: as above — factory mock, not the real action.
		(updateUserSettings as Mock).mockResolvedValue(undefined);
		vi.mocked(getAccessibleCalendarIds).mockResolvedValue(['cal-own']);

		const result = await callSave(
			calendarEvent({ defaultCalendarId: 'cal-never-existed' })
		);

		expect(failureOf(result).status).toBe(400);
		expect(createUserSettings).not.toHaveBeenCalled();
		expect(updateUserSettings).not.toHaveBeenCalled();
	});

	it('accepts an owned personal calendar id and saves it', async () => {
		// SAFETY: see the foreign-id test above — factory mocks, not real actions.
		(getUserSettings as Mock).mockResolvedValue({ showAdsAsEvents: false });
		// SAFETY: as above — factory mock, not the real action.
		(updateUserSettings as Mock).mockResolvedValue(undefined);
		vi.mocked(getAccessibleCalendarIds).mockResolvedValue(['cal-own']);

		const result = await callSave(
			calendarEvent({ defaultCalendarId: 'cal-own' })
		);

		expect(result).toMatchObject({ success: true });
		expect(updateUserSettings).toHaveBeenCalledWith(
			'cal-user',
			expect.objectContaining({ defaultCalendarId: 'cal-own' })
		);
	});

	it('accepts a family-shared calendar id and saves it', async () => {
		// SAFETY: see the foreign-id test above — factory mocks, not real actions.
		(getUserSettings as Mock).mockResolvedValue({ showAdsAsEvents: false });
		// SAFETY: as above — factory mock, not the real action.
		(updateUserSettings as Mock).mockResolvedValue(undefined);
		vi.mocked(getAccessibleCalendarIds).mockResolvedValue(['cal-own', 'cal-fam']);

		const result = await callSave(
			calendarEvent({ defaultCalendarId: 'cal-fam' })
		);

		expect(result).toMatchObject({ success: true });
		expect(updateUserSettings).toHaveBeenCalledWith(
			'cal-user',
			expect.objectContaining({ defaultCalendarId: 'cal-fam' })
		);
	});
});
