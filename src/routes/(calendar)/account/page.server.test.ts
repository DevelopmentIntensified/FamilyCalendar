import { describe, it, expect, vi, type Mock } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { actions } from './+page.server';
import {
	getUserSettings,
	updateUserSettings,
	createUserSettings
} from '$lib/server/db/actions/userSettings';
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

function failureOf(result: RequestResult): { status: number; data: Record<string, unknown> } {
	// SAFETY: failing branches return fail(...), which structurally carries
	// status/data (same narrowing style as the claim page test).
	return result as { status: number; data: Record<string, unknown> };
}

const UNSIGNED = {
	request: {
		formData: () => Promise.resolve(new FormData()),
		headers: { get: (name: string) => (name === 'x-forwarded-for' ? '10.0.0.9' : null) }
	},
	locals: { user: null, session: null }
} as never;

describe('unauthenticated POSTs to account actions fail 401 (issue 153)', () => {
	const unsignedActions = [
		'saveCalendarSettings',
		'saveDashboardModules',
		'setNotificationPreference',
		'updateProfile',
		'logoutAllDevices',
		'createApiToken',
		'revokeApiToken',
		'deleteAccount'
	] as const;

	it.each(unsignedActions)('%s returns fail(401) instead of throwing', async (name) => {
		const handler = actions[name] as (event: RequestEvent) => Promise<RequestResult>;

		const result = await handler(UNSIGNED);

		expect(failureOf(result).status).toBe(401);
	});

	it('unauthenticated POSTs write nothing (no settings mutation)', async () => {
		for (const name of unsignedActions) {
			const handler = actions[name] as (event: RequestEvent) => Promise<RequestResult>;
			await handler(UNSIGNED);
		}

		expect(updateUserSettings as Mock).not.toHaveBeenCalled();
		expect(createUserSettings as Mock).not.toHaveBeenCalled();
	});
});

describe('saveCalendarSettings — defaultCalendarId access check (issue 167)', () => {
	function calendarEvent(fields: Record<string, string>) {
		const formData = new FormData();
		formData.set('weekStart', 'sunday');
		formData.set('timeZone', 'UTC');
		formData.set('color', '#3b82f6');
		formData.set('defaultView', 'dayView');
		formData.set('syncEventsToFamilyCalendar', 'false');
		formData.set('autoParseEventDetails', 'false');
		formData.set('showAdsAsEvents', 'false');
		for (const [key, value] of Object.entries(fields)) formData.set(key, value);
		// SAFETY: test double — the action only reads request.formData() and locals.user.
		return {
			request: { formData: () => Promise.resolve(formData) },
			locals: { user: { id: 'cal-user' } }
		} as never;
	}

	// SAFETY: SvelteKit's Actions type erases the handler's signature; tests
	// call it with a plain event double.
	const callSave = actions.saveCalendarSettings as (event: RequestEvent) => Promise<RequestResult>;

	it('rejects a foreign calendar id with a form error and writes nothing', async () => {
		// SAFETY: the settings bindings are vi.mock factory mocks; their real
		// action types cannot express the stub shapes used here.
		(getUserSettings as Mock).mockResolvedValue(null);
		// SAFETY: as above — factory mock, not the real action.
		(updateUserSettings as Mock).mockResolvedValue(undefined);
		vi.mocked(getAccessibleCalendarIds).mockResolvedValue(['cal-own']);

		const result = await callSave(calendarEvent({ defaultCalendarId: 'cal-someone-else' }));

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

		const result = await callSave(calendarEvent({ defaultCalendarId: 'cal-never-existed' }));

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

		const result = await callSave(calendarEvent({ defaultCalendarId: 'cal-own' }));

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

		const result = await callSave(calendarEvent({ defaultCalendarId: 'cal-fam' }));

		expect(result).toMatchObject({ success: true });
		expect(updateUserSettings).toHaveBeenCalledWith(
			'cal-user',
			expect.objectContaining({ defaultCalendarId: 'cal-fam' })
		);
	});
});
