import { describe, it, expect, vi } from 'vitest';

// #283: the dashboard loader hands the viewer's task categories to the Family
// Task Board quick-add. Every data read is stubbed: this file is about the
// one field, not the legs (each leg degrades on its own).
// oxlint-disable-next-line anti-slop/no-module-mocking -- the category list read is covered in actions/taskCategories tests.
vi.mock('$lib/server/db/actions/taskCategories', () => ({
	listCategoryOptions: vi.fn(async () => [{ id: 'c1', name: 'Errands' }])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed reads; not under test here.
vi.mock('$lib/server/db/actions/tasks', () => ({
	getTasksForUser: vi.fn(async () => []),
	getTasksForFamily: vi.fn(async () => [])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed reads; not under test here.
vi.mock('$lib/server/db/actions/dashboard', () => ({
	rankTop3: vi.fn(() => []),
	getUserDayCalendar: vi.fn(async () => ({ events: [] })),
	getFamilyDayEvents: vi.fn(async () => []),
	getKidsScheduleAttendance: vi.fn(async () => []),
	getCompletionTimestamps: vi.fn(async () => []),
	getRecurringDayCompletions: vi.fn(async () => []),
	mergeDayCompletions: vi.fn(() => [])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed reads; not under test here.
vi.mock('$lib/server/db/actions/dashboardModules', () => ({
	getFamilyModuleSwitches: vi.fn(async () => ({}))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed reads; not under test here.
vi.mock('$lib/server/db/actions/groceries', () => ({
	getOpenGroceries: vi.fn(async () => [])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- DB-backed reads; not under test here.
vi.mock('$lib/server/services/eventDisplayService', () => ({
	expandEventsForUser: vi.fn(async () => []),
	parseEvents: vi.fn(async () => []),
	attachRsvpStatus: vi.fn(async () => []),
	attachAttendanceSummaries: vi.fn(async () => [])
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- network/DB-backed read; not under test here.
vi.mock('$lib/server/services/verseService', () => ({
	getTodayVerse: vi.fn(async () => null)
}));

const { load } = await import('./+page.server');

function loadEvent() {
	return {
		locals: { user: { id: 'user-1' } },
		url: new URL('http://localhost/calendar/dashboard'),
		parent: async () => ({ userSettings: null, familyId: 'fam-1', familyMembers: [] })
	};
}

describe('dashboard loader — taskCategories (#283)', () => {
	it("returns the viewer's category options for the board quick-add", async () => {
		// SAFETY: the loader reads only locals.user, url and parent() from the event.
		const data = (await load(loadEvent() as never)) as {
			taskCategories: unknown;
			dashboardData: Promise<unknown>;
		};
		expect(data.taskCategories).toEqual([{ id: 'c1', name: 'Errands' }]);
		const { listCategoryOptions } = await import('$lib/server/db/actions/taskCategories');
		expect(listCategoryOptions).toHaveBeenCalledWith('user-1');
		await data.dashboardData;
	});
});
