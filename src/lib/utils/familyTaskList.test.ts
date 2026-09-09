import { describe, it, expect } from 'vitest';
import {
	filterTasks,
	groupByAssignee,
	matchesSearch,
	memberName,
	type ListMember,
	type ListTask
} from './familyTaskList';

const members: ListMember[] = [
	{ userId: 'u1', firstName: 'Bo', lastName: 'Jo' },
	{ userId: 'u2', firstName: 'Al', lastName: 'Admin' }
];

const tasks: ListTask[] = [
	{
		id: 't1',
		title: 'Mow the lawn',
		notes: null,
		completedAt: null,
		tags: ['yard'],
		assignedTo: 'u1',
		assignmentStatus: 'accepted',
		assigneeFirstName: 'Bo',
		assigneeLastName: 'Jo'
	},
	{
		id: 't2',
		title: 'Pay rent',
		notes: 'landlord Bob',
		completedAt: '2026-09-01',
		tags: [],
		assignedTo: null,
		assignmentStatus: null,
		assigneeFirstName: null,
		assigneeLastName: null
	},
	{
		id: 't3',
		title: 'Buy milk',
		notes: null,
		completedAt: null,
		tags: [],
		assignedTo: 'u2',
		assignmentStatus: 'declined',
		assigneeFirstName: null,
		assigneeLastName: null
	}
];

describe('memberName', () => {
	it('resolves roster names with fallbacks', () => {
		expect(memberName('u1', members)).toBe('Bo Jo');
		expect(memberName(null, members)).toBe('Unassigned');
		expect(memberName('ghost123456', members)).toBe('ghost123');
	});
});

describe('matchesSearch', () => {
	it('matches title, notes, tags, assignee, and roster names', () => {
		expect(matchesSearch(tasks[0], 'mow', members)).toBe(true);
		expect(matchesSearch(tasks[1], 'landlord', members)).toBe(true);
		expect(matchesSearch(tasks[0], 'yard', members)).toBe(true);
		expect(matchesSearch(tasks[0], 'bo jo', members)).toBe(true);
		expect(matchesSearch(tasks[2], 'al', members)).toBe(true);
		expect(matchesSearch(tasks[0], 'zzz', members)).toBe(false);
		expect(matchesSearch(tasks[0], '', members)).toBe(true);
	});
});

describe('filterTasks', () => {
	it('splits open/completed honoring tag + search filters', () => {
		expect(filterTasks(tasks, { tagFilter: '', searchQuery: '', members }).open.map((t) => t.id)).toEqual([
			't1',
			't3'
		]);
		expect(
			filterTasks(tasks, { tagFilter: '', searchQuery: '', members }).completed.map((t) => t.id)
		).toEqual(['t2']);
		expect(
			filterTasks(tasks, { tagFilter: 'yard', searchQuery: '', members }).open.map((t) => t.id)
		).toEqual(['t1']);
		expect(
			filterTasks(tasks, { tagFilter: '', searchQuery: 'rent', members }).completed.map(
				(t) => t.id
			)
		).toEqual(['t2']);
	});
});

describe('groupByAssignee', () => {
	const t4: ListTask = {
		id: 't4',
		title: 'Fix fence',
		notes: null,
		completedAt: null,
		tags: [],
		assignedTo: 'u2',
		assignmentStatus: 'accepted',
		assigneeFirstName: null,
		assigneeLastName: null
	};

	it('buckets by assignee (declined excluded), viewer first, rest unassigned', () => {
		const open = [tasks[0], tasks[2], t4];
		const { byAssignee, unassignedTasks } = groupByAssignee(open, members, 'u2');
		expect(byAssignee.map((g) => g.member.userId)).toEqual(['u2', 'u1']);
		expect(byAssignee[0].tasks.map((t) => t.id)).toEqual(['t4']);
		expect(byAssignee[1].tasks.map((t) => t.id)).toEqual(['t1']);
		// t3 declined u2 → in no bucket → unassigned legacy bucket.
		expect(unassignedTasks.map((t) => t.id)).toEqual(['t3']);
	});

	it('parks tasks nobody claimed in the unassigned bucket', () => {
		const lone: ListTask = { ...tasks[0], id: 't9', assignedTo: 'ghost' };
		const { byAssignee, unassignedTasks } = groupByAssignee([lone], members, 'u1');
		expect(byAssignee).toEqual([]);
		expect(unassignedTasks.map((t) => t.id)).toEqual(['t9']);
	});
});
