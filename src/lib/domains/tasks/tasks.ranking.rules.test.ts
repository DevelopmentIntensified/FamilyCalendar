/**
 * The open-Task order as tables. Every case is carried over from the legacy
 * `src/lib/server/db/actions/dashboard.test.ts:25-120` (`rankTop3`, which the
 * Day Dashboard's Top-3 and the Family Task Board order through), with the
 * Top-3 slice now the caller's `limit: 3`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { rankTasks, type TaskRankRow } from './tasks.ranking.rules';

/** Fixed "today" boundary (UTC) so overdue/today/next buckets are deterministic. */
const TODAY = '2026-08-19T00:00:00.000Z';
const ME = 'u-dad';
const OTHER = 'u-mom';

function task(overrides: Partial<TaskRankRow>): TaskRankRow {
	return {
		title: 'Task',
		dueDate: null,
		completedAt: null,
		archivedAt: null,
		priority: 'normal',
		userId: OTHER,
		assignedTo: null,
		...overrides
	};
}

/** The ids in order, for a compacter assertion. */
function order(rows: readonly TaskRankRow[]): (string | undefined)[] {
	return rows.map((row) => (row as TaskRankRow & { id?: string }).id);
}

function withId(id: string, overrides: Partial<TaskRankRow> = {}): TaskRankRow & { id: string } {
	return { ...task(overrides), id };
}

describe('rankTasks', () => {
	it('leads with the viewer`s own tasks even when lower priority than the family`s', () => {
		const mineLow = withId('mine', {
			title: 'Mow lawn (mine)',
			priority: 'low',
			dueDate: '2026-08-26T12:00:00.000Z',
			assignedTo: ME
		});
		const otherHigh = withId('other', {
			title: 'Science fair board (theirs)',
			priority: 'high',
			dueDate: '2026-08-18T12:00:00.000Z'
		});
		expect(order(rankTasks([otherHigh, mineLow], ME, { todayStart: TODAY }))).toEqual([
			'mine',
			'other'
		]);
	});

	it('ranks non-mine tasks by priority: high → normal → low', () => {
		const high = withId('h', { priority: 'high', dueDate: '2026-09-01T00:00:00.000Z' });
		const normal = withId('n', { priority: 'normal', dueDate: '2026-09-01T00:00:00.000Z' });
		const low = withId('l', { priority: 'low', dueDate: '2026-08-18T00:00:00.000Z' });
		expect(order(rankTasks([low, high, normal], ME, { todayStart: TODAY }))).toEqual([
			'h',
			'n',
			'l'
		]);
	});

	it('orders equal-priority tasks overdue → due-today → next → no due', () => {
		const noDue = withId('nd');
		const overdue = withId('od', { dueDate: '2026-08-18T23:59:00.000Z' });
		const today = withId('td', { dueDate: '2026-08-19T10:00:00.000Z' });
		const future = withId('fx', { dueDate: '2026-08-27T10:00:00.000Z' });
		expect(order(rankTasks([noDue, future, today, overdue], ME, { todayStart: TODAY }))).toEqual([
			'od',
			'td',
			'fx',
			'nd'
		]);
	});

	it('ranks a high-priority task with no due date above low-priority due-today work', () => {
		const highNoDue = withId('gate', { title: 'Fix squeaky gate', priority: 'high' });
		const lowToday = withId('recycle', {
			title: 'Take out recycling',
			priority: 'low',
			dueDate: '2026-08-19T20:00:00.000Z'
		});
		expect(order(rankTasks([lowToday, highNoDue], ME, { todayStart: TODAY }))[0]).toBe('gate');
	});

	it('breaks equal-bucket ties by earliest due date, then title', () => {
		const later = withId('b', { title: 'Bravo', dueDate: '2026-08-27T12:00:00.000Z' });
		const earlier = withId('a', { title: 'Alpha', dueDate: '2026-08-23T12:00:00.000Z' });
		expect(order(rankTasks([later, earlier], ME, { todayStart: TODAY }))).toEqual(['a', 'b']);
	});

	it('falls back to the title when the due dates tie', () => {
		const zulu = withId('z', { title: 'Zulu', dueDate: '2026-08-27T12:00:00.000Z' });
		const alpha = withId('a', { title: 'Alpha', dueDate: '2026-08-27T12:00:00.000Z' });
		expect(order(rankTasks([zulu, alpha], ME, { todayStart: TODAY }))).toEqual(['a', 'z']);
	});

	it('never surfaces completed or archived tasks', () => {
		const done = withId('done', {
			priority: 'high',
			dueDate: '2026-08-18T00:00:00.000Z',
			completedAt: '2026-08-18T10:00:00.000Z'
		});
		const archived = withId('arch', {
			priority: 'high',
			dueDate: '2026-08-18T00:00:00.000Z',
			archivedAt: '2026-08-18T10:00:00.000Z'
		});
		const fresh = withId('fresh', { priority: 'high', dueDate: '2026-08-18T00:00:00.000Z' });
		expect(order(rankTasks([done, archived, fresh], ME, { todayStart: TODAY }))).toEqual(['fresh']);
	});

	it('caps the result at the requested limit (Top-3 Priorities)', () => {
		const many = Array.from({ length: 6 }, (_, index) =>
			withId(`t${index}`, {
				priority: 'high',
				dueDate: '2026-08-18T00:00:00.000Z',
				title: `Task ${index}`
			})
		);
		expect(rankTasks(many, ME, { todayStart: TODAY, limit: 3 })).toHaveLength(3);
	});

	it('returns the same objects it was given (names and tags ride along)', () => {
		const row = { ...withId('one', { priority: 'high' }), tags: ['milk'] };
		const [first] = rankTasks([row], ME, { todayStart: TODAY, limit: 3 });
		expect(first).toBe(row);
	});

	it('treats an unknown priority as normal', () => {
		const unknown = withId('u', { priority: 'urgent' });
		const low = withId('l', { priority: 'low' });
		expect(order(rankTasks([low, unknown], ME, { todayStart: TODAY }))).toEqual(['u', 'l']);
	});
});
