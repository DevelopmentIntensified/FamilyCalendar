import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * GET /api/sponsored-events (#292 G6): [] unless the user opted in; the
 * month param picks which month's ads; rows carry isAd + the amber colour.
 */
// oxlint-disable-next-line anti-slop/no-module-mocking -- the ad store/generator is DB-backed; shouldServeAds stays real.
vi.mock('$lib/server/services/adService', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/services/adService')>()),
	getAdEventsForUser: vi.fn(async (userId: string, month: number, year: number) => [
		{
			id: `ad-${year}-${month}`,
			title: '📢 Sale',
			description: '',
			start: '2026-11-05T00:00:00.000Z',
			end: '2026-11-05T00:00:00.000Z',
			allDay: true,
			calendarId: '',
			ownerId: userId,
			location: null,
			recurrenceFrequency: null,
			recurrenceInterval: null,
			created_at: new Date('2026-11-01T00:00:00.000Z')
		}
	])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; reads user_settings.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => ({ showAdsAsEvents: true, timeZone: 'UTC' }))
}));

import { GET } from './+server';
import { getAdEventsForUser } from '$lib/server/services/adService';
import { getUserSettings } from '$lib/server/db/actions/userSettings';

function ev(user: { id: string } | null, qs = '') {
	// SAFETY: test double — the handler reads locals.user and url only.
	return { locals: { user }, url: new URL(`http://localhost/api/sponsored-events${qs}`) } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/sponsored-events (G6)', () => {
	it('401 without auth', async () => {
		expect((await GET(ev(null))).status).toBe(401);
	});

	it.each(['2026-13', '2026-1', 'nov', '2026-11-01'])('400 for month=%s', async (m) => {
		const res = await GET(ev({ id: 'u1' }, `?month=${m}`));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Invalid month' });
	});

	it('opted-in: the requested month, marked isAd + amber', async () => {
		const body = await (await GET(ev({ id: 'u1' }, '?month=2026-11'))).json();
		expect(getAdEventsForUser).toHaveBeenCalledWith('u1', 11, 2026);
		expect(body.events).toHaveLength(1);
		expect(body.events[0]).toMatchObject({ id: 'ad-2026-11', isAd: true, color: '#f59e0b' });
	});

	it('not opted in → [] and no ad read', async () => {
		vi.mocked(getUserSettings).mockResolvedValueOnce({ showAdsAsEvents: false } as never);
		const body = await (await GET(ev({ id: 'u1' }, '?month=2026-11'))).json();
		expect(body).toEqual({ events: [] });
		expect(getAdEventsForUser).not.toHaveBeenCalled();
	});
});
