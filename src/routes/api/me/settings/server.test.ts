import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * /api/me/settings (#292 G3): GET mirrors the /account settings card;
 * PATCH merges a subset onto the stored row and writes through the same
 * saveCalendarSettings as the form (consent trail, default-calendar check).
 */
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed settings seam.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(),
	updateUserSettings: vi.fn(),
	createUserSettings: vi.fn()
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed calendar scope.
vi.mock('$lib/server/db/actions/calendarScope', () => ({
	getAccessibleCalendarIds: vi.fn(async () => ['cal-own'])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- consent trail is DB-backed.
vi.mock('$lib/server/services/adConsentService', () => ({
	recordAdConsentChange: vi.fn(),
	getAdConsentRecords: vi.fn(async () => [
		{ decision: 'granted', recordedAt: new Date('2026-10-01T00:00:00.000Z') }
	])
}));

import { GET, PATCH } from './+server';
import {
	getUserSettings,
	updateUserSettings,
	createUserSettings
} from '$lib/server/db/actions/userSettings';
import { recordAdConsentChange } from '$lib/server/services/adConsentService';

const STORED = {
	userId: 'u1',
	weekStart: 'monday',
	timeZone: 'America/Chicago',
	color: '#112233',
	defaultView: 'dashboard',
	defaultCalendarId: 'cal-gone',
	syncEventsToFamilyCalendar: true,
	autoParseEventDetails: false,
	showDailyVerse: true,
	showAdsAsEvents: false,
	verseTranslation: 'esv'
};

function getEv(user: { id: string } | null) {
	// SAFETY: test double — the handler reads locals.user only.
	return { locals: { user } } as never;
}
function patchEv(body: unknown, user: { id: string } | null = { id: 'u1' }) {
	// SAFETY: test double — the handler reads locals.user and request.json().
	return {
		locals: { user },
		request: new Request('http://x/api/me/settings', {
			method: 'PATCH',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		})
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getUserSettings).mockResolvedValue(STORED as never);
});

describe('GET /api/me/settings (G3)', () => {
	it('401 without auth', async () => {
		expect((await GET(getEv(null))).status).toBe(401);
	});

	it('settings (incl. defaultView) + translations + consent history', async () => {
		const body = await (await GET(getEv({ id: 'u1' }))).json();
		expect(body.settings.defaultView).toBe('dashboard');
		expect(body.verseTranslations[0]).toEqual(
			expect.objectContaining({ id: expect.any(String), label: expect.any(String) })
		);
		expect(body.consentHistory).toEqual([
			{ decision: 'granted', recordedAt: '2026-10-01T00:00:00.000Z' }
		]);
	});

	it('no settings row → the page defaults (defaultView dayView)', async () => {
		vi.mocked(getUserSettings).mockResolvedValue(undefined as never);
		const body = await (await GET(getEv({ id: 'u1' }))).json();
		expect(body.settings.defaultView).toBe('dayView');
		expect(body.settings.showAdsAsEvents).toBe(false);
	});
});

describe('PATCH /api/me/settings (G3)', () => {
	it('401 without auth', async () => {
		expect((await PATCH(patchEv({ timeZone: 'UTC' }, null))).status).toBe(401);
	});

	it.each([
		[{ timeZone: 'Mars/Base' }, 'Invalid timeZone'],
		[{ weekStart: 'friday' }, 'Invalid weekStart'],
		[{ defaultView: 'yearView' }, 'Invalid defaultView'],
		[{ color: 'red' }, 'Invalid color'],
		[{ showAdsAsEvents: 'yes' }, 'Invalid showAdsAsEvents'],
		[{ verseTranslation: 'xyz' }, 'Invalid verseTranslation'],
		[{ hiddenDashboardModules: [] }, 'Unknown field: hiddenDashboardModules'],
		[[1], 'Invalid body']
	])('400 %j', async (body, error) => {
		const res = await PATCH(patchEv(body));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error });
		expect(updateUserSettings).not.toHaveBeenCalled();
	});

	it('400 on malformed JSON', async () => {
		const res = await PATCH(patchEv('{nope'));
		expect(res.status).toBe(400);
	});

	it('timeZone alone keeps every other stored field (and skips the stale default-calendar check)', async () => {
		const res = await PATCH(patchEv({ timeZone: 'Asia/Tokyo' }));
		expect(res.status).toBe(200);
		expect(updateUserSettings).toHaveBeenCalledWith('u1', {
			weekStart: 'monday',
			timeZone: 'Asia/Tokyo',
			color: '#112233',
			defaultView: 'dashboard',
			defaultCalendarId: 'cal-gone',
			syncEventsToFamilyCalendar: true,
			autoParseEventDetails: false,
			showDailyVerse: true,
			showAdsAsEvents: false,
			verseTranslation: 'esv'
		});
		const body = await res.json();
		expect(body.settings).toBeDefined();
	});

	it('a newly set default calendar must be accessible (same 400 as the form)', async () => {
		const res = await PATCH(patchEv({ defaultCalendarId: 'cal-foreign' }));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Selected default calendar is not available' });
		expect(updateUserSettings).not.toHaveBeenCalled();
	});

	it('ad opt-in records the consent transition', async () => {
		await PATCH(patchEv({ showAdsAsEvents: true }));
		expect(recordAdConsentChange).toHaveBeenCalledWith('u1', false, true);
	});

	it('no settings row → creates one from the defaults + patch', async () => {
		vi.mocked(getUserSettings).mockResolvedValue(undefined as never);
		await PATCH(patchEv({ defaultView: 'monthView' }));
		expect(createUserSettings).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 'u1', defaultView: 'monthView', weekStart: 'sunday' })
		);
	});
});
