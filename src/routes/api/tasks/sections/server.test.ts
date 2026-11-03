import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * GET /api/tasks/sections (#292 G9): the tasks page's sectioned lists for
 * the Bearer user, read through the same loadTaskSections the web loader
 * uses — parity is pinned by running both against the same readers.
 */

// oxlint-disable-next-line anti-slop/no-module-mocking -- list readers are scripted; their SQL is covered in actions/tasks tests.
vi.mock('$lib/server/db/actions/tasks', () => ({
	getTasksForUser: vi.fn(async () => [{ id: 'all-1', tags: [] }]),
	getMyTasks: vi.fn(async () => [{ id: 'mine-1', tags: ['a'] }]),
	getPendingAssignments: vi.fn(async () => [{ id: 'pend-1', tags: [] }]),
	getRequestedByMe: vi.fn(async () => [{ id: 'req-1', tags: [] }])
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; the real module reads familyMembers from the DB.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => 'fam-1')
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; the real module reads user_settings.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => ({ timeZone: 'America/Chicago' }))
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the category list read is covered in actions/taskCategories tests.
vi.mock('$lib/server/db/actions/taskCategories', () => ({
	listCategoryOptions: vi.fn(async () => [])
}));

import { GET } from './+server';
import { load } from '../../../(calendar)/calendar/tasks/+page.server';
import { getTasksForUser, getMyTasks } from '$lib/server/db/actions/tasks';

function apiEvent(user: { id: string } | null) {
	// SAFETY: test double — the handler reads locals.user only.
	return { locals: { user }, url: new URL('http://localhost/api/tasks/sections') } as never;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/tasks/sections (G9)', () => {
	it('401 without auth', async () => {
		const res = await GET(apiEvent(null));
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Unauthorized' });
	});

	it('returns the three sections + warnings, scoped to the caller family and zone', async () => {
		const res = await GET(apiEvent({ id: 'user-1' }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			myTasks: [{ id: 'mine-1', tags: ['a'] }],
			pendingAssignments: [{ id: 'pend-1', tags: [] }],
			requestedByMe: [{ id: 'req-1', tags: [] }],
			warnings: []
		});
		expect(getTasksForUser).toHaveBeenCalledWith('user-1', 'fam-1', 'America/Chicago');
		expect(getMyTasks).toHaveBeenCalledWith('user-1');
	});

	it('a failing leg degrades to [] with its warning label', async () => {
		vi.mocked(getMyTasks).mockRejectedValueOnce(new Error('boom'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const body = await (await GET(apiEvent({ id: 'user-1' }))).json();
		expect(body.myTasks).toEqual([]);
		expect(body.warnings).toEqual(['myTasks']);
	});

	it('parity: same sections as the /calendar/tasks page loader', async () => {
		const api = await (await GET(apiEvent({ id: 'user-1' }))).json();
		// SAFETY: test double — the loader reads locals.user and parent() only.
		const page = (await load({
			locals: { user: { id: 'user-1' } },
			parent: async () => ({
				familyId: 'fam-1',
				userSettings: { timeZone: 'America/Chicago' },
				familyMembers: []
			})
		} as never)) as { taskLists: Record<string, unknown> };
		expect(api.myTasks).toEqual(page.taskLists.myTasks);
		expect(api.pendingAssignments).toEqual(page.taskLists.pendingAssignments);
		expect(api.requestedByMe).toEqual(page.taskLists.requestedByMe);
		expect(api.warnings).toEqual(page.taskLists.warnings);
	});
});
