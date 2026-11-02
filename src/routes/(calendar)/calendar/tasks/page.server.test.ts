import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #235: getTasksForUser owns the Recurring Task cursor pin (issue 110) —
 * the other section reads (My Tasks, To accept, Requested) do not sync. They
 * must start only AFTER the sync-bearing read finished, or the first load
 * shows yesterday's overdue cursor until a refresh.
 */
const order = vi.hoisted(() => ({ log: [] as string[] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- list readers become ordered spies; their SQL is covered in actions/tasks tests.
vi.mock('$lib/server/db/actions/tasks', () => {
	const reader = (name: string, delayMs = 0) =>
		vi.fn(async () => {
			order.log.push(`${name}:start`);
			if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
			order.log.push(`${name}:end`);
			return [];
		});
	return {
		// The sync-bearing read is slow: a parallel start would interleave.
		getTasksForUser: reader('getTasksForUser', 5),
		getMyTasks: reader('getMyTasks'),
		getPendingAssignments: reader('getPendingAssignments'),
		getRequestedByMe: reader('getRequestedByMe')
	};
});

import { load } from './+page.server';
import { getTasksForUser } from '$lib/server/db/actions/tasks';

function loadEvent() {
	// SAFETY: test double — the loader reads locals.user and parent() only.
	return {
		locals: { user: { id: 'user-1' } },
		parent: async () => ({
			familyId: 'fam-1',
			userSettings: { timeZone: 'America/Chicago' },
			familyMembers: []
		})
	} as never;
}

beforeEach(() => {
	order.log = [];
	vi.clearAllMocks();
});

describe('/calendar/tasks load — sync before section reads (#235)', () => {
	it('starts every non-syncing section read only after getTasksForUser resolved', async () => {
		await load(loadEvent());

		const syncEnd = order.log.indexOf('getTasksForUser:end');
		expect(syncEnd).toBeGreaterThanOrEqual(0);
		for (const name of ['getMyTasks', 'getPendingAssignments', 'getRequestedByMe']) {
			expect(order.log.indexOf(`${name}:start`)).toBeGreaterThan(syncEnd);
		}
	});

	it('passes the user zone to the syncing read', async () => {
		await load(loadEvent());

		expect(getTasksForUser).toHaveBeenCalledWith('user-1', 'fam-1', 'America/Chicago');
	});

	it('a failing sync read still lets the sections load (leg fallback)', async () => {
		vi.mocked(getTasksForUser).mockRejectedValueOnce(new Error('boom'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		// SAFETY: load returns the plain data object (no redirect for a signed-in user).
		const data = (await load(loadEvent())) as { taskLists: { warnings: string[] } };

		expect(data.taskLists.warnings).toEqual(['tasks+cursor']);
		expect(order.log).toContain('getMyTasks:end');
	});
});
