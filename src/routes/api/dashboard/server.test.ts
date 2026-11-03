import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * GET /api/dashboard (#292 G8): the Day Dashboard loader verbatim, streamed
 * promise resolved, through the same loadDashboard the web page calls.
 * Every DB read is scripted; parity with the page loader is pinned below.
 */
// oxlint-disable-next-line anti-slop/no-module-mocking -- the category list read is covered in actions/taskCategories tests.
vi.mock('$lib/server/db/actions/taskCategories', () => ({
	listCategoryOptions: vi.fn(async () => [{ id: 'c1', name: 'Errands' }])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed reads; scripted.
vi.mock('$lib/server/db/actions/tasks', () => ({
	getTasksForUser: vi.fn(async () => [
		{ id: 't1', title: 'Open', completedAt: null, dueDate: '2026-11-02T10:00:00.000Z' }
	]),
	getTasksForFamily: vi.fn(async () => [])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed reads; scripted.
vi.mock('$lib/server/db/actions/dashboard', () => ({
	rankTop3: vi.fn((rows: unknown[]) => rows),
	getUserDayCalendar: vi.fn(async () => ({ events: [] })),
	getFamilyDayEvents: vi.fn(async () => []),
	getKidsScheduleAttendance: vi.fn(async () => []),
	getCompletionTimestamps: vi.fn(async () => []),
	getRecurringDayCompletions: vi.fn(async () => []),
	mergeDayCompletions: vi.fn(() => [])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed reads; scripted.
vi.mock('$lib/server/db/actions/dashboardModules', () => ({
	getFamilyModuleSwitches: vi.fn(async () => ({}))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed reads; scripted.
vi.mock('$lib/server/db/actions/groceries', () => ({
	getOpenGroceries: vi.fn(async () => [])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed reads; scripted.
vi.mock('$lib/server/services/eventDisplayService', () => ({
	expandEventsForUser: vi.fn(async () => []),
	parseEvents: vi.fn(async () => []),
	attachRsvpStatus: vi.fn(async () => []),
	attachAttendanceSummaries: vi.fn(async () => [])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- network/DB-backed read; scripted.
vi.mock('$lib/server/services/verseService', () => ({
	getTodayVerse: vi.fn(async () => ({ reference: 'Ps 118:24', text: 'This is the day', attribution: 'KJV' }))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; reads user_settings.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => ({ timeZone: 'America/Chicago', showDailyVerse: true }))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; reads familyMembers.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => 'fam-1'),
	getFamilyRoster: vi.fn(async () => [])
}));

const { GET } = await import('./+server');
const { load } = await import('../../(calendar)/calendar/dashboard/+page.server');

function apiEvent(user: { id: string } | null, qs = '') {
	// SAFETY: test double — the handler reads locals.user and url only.
	return { locals: { user }, url: new URL(`http://localhost/api/dashboard${qs}`) } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/dashboard (G8)', () => {
	it('401 without auth', async () => {
		const res = await GET(apiEvent(null));
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Unauthorized' });
	});

	it('400 for a malformed date', async () => {
		const res = await GET(apiEvent({ id: 'user-1' }, '?date=11/02/2026'));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Invalid date' });
	});

	it('returns the §3 contract with data resolved, for the viewed day in the user zone', async () => {
		const res = await GET(apiEvent({ id: 'user-1' }, '?date=2026-11-02'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Object.keys(body).sort()).toEqual(
			[
				'zone',
				'dayISO',
				'isToday',
				'meId',
				'familyId',
				'modules',
				'dailyVerse',
				'taskCategories',
				'data',
				'warnings'
			].sort()
		);
		expect(body.zone).toBe('America/Chicago');
		expect(body.dayISO).toBe('2026-11-02T00:00:00.000-06:00');
		expect(body.meId).toBe('user-1');
		expect(body.familyId).toBe('fam-1');
		expect(body.dailyVerse.reference).toBe('Ps 118:24');
		expect(body.taskCategories).toEqual([{ id: 'c1', name: 'Errands' }]);
		expect(Object.keys(body.data).sort()).toEqual(
			[
				'userTasks',
				'familyTasks',
				'familyMembers',
				'dayEvents',
				'top3',
				'glance',
				'completedToday',
				'kidsSchedule',
				'familyGroceries',
				'mineGroceries'
			].sort()
		);
		expect(body.data.glance).toEqual({ doneToday: 0, openToday: 1, weekStreak: 0 });
		expect(body.warnings).toEqual([]);
	});

	it('parity: same data as the /calendar/dashboard page loader', async () => {
		const api = await (await GET(apiEvent({ id: 'user-1' }, '?date=2026-11-02'))).json();
		// SAFETY: the loader reads only locals.user, url and parent() from the event.
		const page = (await load({
			locals: { user: { id: 'user-1' } },
			url: new URL('http://localhost/calendar/dashboard?date=2026-11-02'),
			parent: async () => ({
				userSettings: { timeZone: 'America/Chicago', showDailyVerse: true },
				familyId: 'fam-1',
				familyMembers: []
			})
		} as never)) as Record<string, unknown> & { dashboardData: Promise<{ warnings: string[] }> };
		const { warnings, ...data } = await page.dashboardData;
		expect(api.data).toEqual(JSON.parse(JSON.stringify(data)));
		expect(api.warnings).toEqual([...(page.loadWarnings as string[]), ...warnings]);
		expect(api.dayISO).toBe(page.dayISO);
		expect(api.modules).toEqual(page.modules);
	});
});
