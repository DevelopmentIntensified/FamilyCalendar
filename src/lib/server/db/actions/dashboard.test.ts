import { describe, it, expect } from 'vitest';
import type { RankableTask } from './dashboard';
import { rankTop3 } from './dashboard';

// Fixed "today" boundary (UTC) so overdue/today/next buckets are deterministic.
const TODAY = '2026-08-19T00:00:00.000Z'; // Wednesday

const ME = 'u-dad';
const OTHER = 'u-mom';

function task(over: Partial<RankableTask>): RankableTask {
	return {
		id: 't1',
		title: 'Task',
		dueDate: null,
		completedAt: null,
		priority: 'normal',
		userId: OTHER,
		assignedTo: null,
		assignmentStatus: 'none',
		...over
	};
}

describe('rankTop3', () => {
	it('leads with the viewer’s own tasks even when lower priority than the family’s', () => {
		const mineLow = task({
			id: 'mine',
			title: 'Mow lawn (mine)',
			priority: 'low',
			dueDate: '2026-08-26T12:00:00.000Z',
			userId: OTHER,
			assignedTo: ME
		});
		const otherHigh = task({
			id: 'other',
			title: 'Science fair board (theirs)',
			priority: 'high',
			dueDate: '2026-08-18T12:00:00.000Z',
			userId: OTHER
		});
		const out = rankTop3([otherHigh, mineLow], ME, { todayStartIso: TODAY });
		expect(out.map((t) => t.id)).toEqual(['mine', 'other']);
	});

	it('ranks non-mine tasks by priority: high → normal → low', () => {
		const high = task({ id: 'h', priority: 'high', dueDate: '2026-09-01T00:00:00.000Z' });
		const normal = task({ id: 'n', priority: 'normal', dueDate: '2026-09-01T00:00:00.000Z' });
		const low = task({ id: 'l', priority: 'low', dueDate: '2026-08-18T00:00:00.000Z' });
		const out = rankTop3([low, high, normal], ME, { todayStartIso: TODAY });
		expect(out.map((t) => t.id)).toEqual(['h', 'n', 'l']);
	});

	it('orders equal-priority tasks overdue → due-today → next → no due', () => {
		const noDue = task({ id: 'nd' });
		const overdue = task({ id: 'od', dueDate: '2026-08-18T23:59:00.000Z' });
		const today = task({ id: 'td', dueDate: '2026-08-19T10:00:00.000Z' });
		const future = task({ id: 'fx', dueDate: '2026-08-27T10:00:00.000Z' });
		const out = rankTop3([noDue, future, today, overdue], ME, { todayStartIso: TODAY, limit: 4 });
		expect(out.map((t) => t.id)).toEqual(['od', 'td', 'fx', 'nd']);
	});

	it('ranks a high-priority task with no due date above low-priority due-today work', () => {
		const highNoDue = task({ id: 'gate', title: 'Fix squeaky gate', priority: 'high' });
		const lowToday = task({ id: 'recycle', title: 'Take out recycling', priority: 'low', dueDate: '2026-08-19T20:00:00.000Z' });
		const out = rankTop3([lowToday, highNoDue], ME, { todayStartIso: TODAY });
		expect(out[0].id).toBe('gate');
	});

	it('breaks equal-bucket ties by earliest due date, then title', () => {
		const later = task({ id: 'b', title: 'Bravo', dueDate: '2026-08-27T12:00:00.000Z' });
		const earlier = task({ id: 'a', title: 'Alpha', dueDate: '2026-08-23T12:00:00.000Z' });
		const out = rankTop3([later, earlier], ME, { todayStartIso: TODAY });
		expect(out.map((t) => t.id)).toEqual(['a', 'b']);
	});

	it('never surfaces completed or archived tasks', () => {
		const done = task({ id: 'done', priority: 'high', dueDate: '2026-08-18T00:00:00.000Z', completedAt: '2026-08-18T10:00:00.000Z' });
		const archived = task({ id: 'arch', priority: 'high', dueDate: '2026-08-18T00:00:00.000Z', archivedAt: '2026-08-18T10:00:00.000Z' });
		const fresh = task({ id: 'fresh', priority: 'high', dueDate: '2026-08-18T00:00:00.000Z' });
		const out = rankTop3([done, archived, fresh], ME, { todayStartIso: TODAY });
		expect(out.map((t) => t.id)).toEqual(['fresh']);
	});

	it('caps the result at three', () => {
		const many = Array.from({ length: 6 }, (_, i) =>
			task({ id: `t${i}`, priority: 'high', dueDate: '2026-08-18T00:00:00.000Z', title: `Task ${i}` })
		);
		expect(rankTop3(many, ME, { todayStartIso: TODAY })).toHaveLength(3);
	});

	it('returns fewer than three when fewer qualify', () => {
		const one = task({ id: 'only', priority: 'high', dueDate: '2026-08-18T00:00:00.000Z' });
		const out = rankTop3([one], ME, { todayStartIso: TODAY });
		expect(out.map((t) => t.id)).toEqual(['only']);
	});
});