import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #280: every task list read (user / family / section views the web pages
 * and the phone load) carries `category`. The drizzle stub records each
 * SELECT's field map; the list SELECT is the one that projects task columns.
 */
const state = vi.hoisted(() => ({ selected: [] as Record<string, unknown>[] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub records SELECT field maps; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => {
	const node = () => {
		const n = {
			from: () => n,
			leftJoin: () => n,
			innerJoin: () => n,
			where: () => Object.assign(Promise.resolve([]), { orderBy: () => Promise.resolve([]) })
		};
		return n;
	};
	return {
		db: {
			select: (fields?: Record<string, unknown>) => {
				if (fields) state.selected.push(fields);
				return node();
			},
			update: () => ({ set: () => ({ where: () => Promise.resolve() }) })
		}
	};
});

import { getTasksForUser, getTasksForFamily, getMyTasks, getPublicTasksForFamily } from './index';
import { getPendingAssignments, getRequestedByMe } from './assignment';

const listSelect = () => state.selected.find((f) => 'title' in f && 'focusMinutes' in f);

beforeEach(() => {
	state.selected = [];
});

describe('task list reads include category (#280)', () => {
	it.each([
		['getTasksForUser', () => getTasksForUser('u1', 'fam-1', 'UTC')],
		['getTasksForFamily', () => getTasksForFamily('fam-1', 'UTC')],
		['getMyTasks', () => getMyTasks('u1')],
		['getPublicTasksForFamily', () => getPublicTasksForFamily('fam-1', 'UTC')],
		['getPendingAssignments', () => getPendingAssignments('u1')],
		['getRequestedByMe', () => getRequestedByMe('u1')]
	])('%s', async (_name, read) => {
		await read();
		expect(listSelect()).toBeDefined();
		expect(listSelect()).toHaveProperty('category');
	});
});
