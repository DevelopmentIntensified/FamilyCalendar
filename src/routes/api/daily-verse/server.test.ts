import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * GET /api/daily-verse (#292 G7): null unless BOTH the setting and the
 * family module switch allow it (dashboardVisibility, real); the bundled
 * verse list (real) picks the day's verse.
 */
// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; reads user_settings.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => ({ showDailyVerse: true, hiddenDashboardModules: [] }))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; reads familyMembers.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => 'fam-1')
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; reads the family's module switches.
vi.mock('$lib/server/db/actions/dashboardModules', () => ({
	getFamilyModuleSwitches: vi.fn(async () => ({}))
}));

import { GET } from './+server';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { getFamilyModuleSwitches } from '$lib/server/db/actions/dashboardModules';
import { getVerseForDate } from '$lib/server/services/verseService';

function ev(user: { id: string } | null, qs = '') {
	// SAFETY: test double — the handler reads locals.user and url only.
	return { locals: { user }, url: new URL(`http://localhost/api/daily-verse${qs}`) } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/daily-verse (G7)', () => {
	it('401 without auth', async () => {
		expect((await GET(ev(null))).status).toBe(401);
	});

	it.each(['2026-11-32', '11/02/2026', 'today'])('400 for date=%s', async (d) => {
		const res = await GET(ev({ id: 'u1' }, `?date=${d}`));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Invalid date' });
	});

	it("returns that day's verse {reference,text,attribution}", async () => {
		const body = await (await GET(ev({ id: 'u1' }, '?date=2026-11-02'))).json();
		const expected = await getVerseForDate('2026-11-02');
		expect(body).toEqual({
			verse: {
				reference: expected.reference,
				text: expected.text,
				attribution: expected.attribution
			}
		});
	});

	it('null when the user hid the verse', async () => {
		vi.mocked(getUserSettings).mockResolvedValueOnce({ showDailyVerse: false } as never);
		expect(await (await GET(ev({ id: 'u1' }))).json()).toEqual({ verse: null });
	});

	it('null when the verse module is in the hidden list (setting still on)', async () => {
		vi.mocked(getUserSettings).mockResolvedValueOnce({
			showDailyVerse: true,
			hiddenDashboardModules: ['verse']
		} as never);
		expect(await (await GET(ev({ id: 'u1' }))).json()).toEqual({ verse: null });
	});

	it('a failing switch read still answers (the loader degrade)', async () => {
		vi.mocked(getFamilyModuleSwitches).mockRejectedValueOnce(new Error('boom'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const body = await (await GET(ev({ id: 'u1' }, '?date=2026-11-02'))).json();
		expect(body.verse).not.toBeNull();
	});
});
