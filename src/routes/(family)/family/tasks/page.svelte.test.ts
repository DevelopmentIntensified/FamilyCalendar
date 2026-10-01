import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/svelte';
import FamilyTasksPage from './+page.svelte';
import type { PageData } from './$types';

/**
 * Fixture typed from the loader's own types, so nothing here needs a cast:
 * a row that does not match the loader is a fixture bug, not a silence.
 */
type FamilyRow = PageData['tasks'][number];

const roster: PageData['familyRoster'] = [
	{
		userId: 'u_mom',
		firstName: 'Maya',
		lastName: 'Lopez',
		email: null,
		role: 'admin',
		memberType: 'parent'
	},
	{
		userId: 'u_dad',
		firstName: 'Sam',
		lastName: 'Smith',
		email: null,
		role: 'creator',
		memberType: 'parent'
	},
	{
		userId: 'u_eli',
		firstName: 'Eli',
		lastName: 'Smith',
		email: null,
		role: 'member',
		memberType: 'child'
	}
];

const BASE: FamilyRow = {
	id: 't1',
	title: 'Mow the lawn',
	notes: null,
	dueDate: null,
	completedAt: null,
	archivedAt: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	completionCount: 0,
	assignedTo: null,
	assignmentStatus: 'none',
	priority: 'normal',
	visibility: 'family',
	userId: 'u_mom',
	familyId: 'fam1',
	eventId: null,
	createdAt: new Date('2026-09-01T00:00:00.000Z'),
	tags: []
};

function familyTask(overrides: Partial<FamilyRow> = {}): FamilyRow {
	return { ...BASE, ...overrides };
}

function data(tasks: PageData['tasks']) {
	const payload: PageData = {
		user: null,
		isLoggedIn: true,
		pathname: '/family/tasks',
		tasks,
		publicTasks: [],
		familyRoster: roster,
		familyId: 'fam1',
		userId: 'u_dad'
	};
	return { data: payload };
}

afterEach(cleanup);

describe('family tasks page — the board, grouped by assignee (issue 101)', () => {
	it('gives each assignee a column carrying their open-task count', () => {
		render(FamilyTasksPage, {
			...data([
				familyTask({ id: 'a', title: 'Mow', assignedTo: 'u_dad' }),
				familyTask({ id: 'b', title: 'Cook', assignedTo: 'u_dad' }),
				familyTask({ id: 'c', title: 'Read', assignedTo: 'u_mom', userId: 'u_mom' })
			])
		});
		expect(screen.getByRole('heading', { name: /You · 2/i })).toBeTruthy();
		expect(screen.getByRole('heading', { name: /Maya Lopez · 1/i })).toBeTruthy();
		// A family member with nothing assigned gets no column at all.
		expect(screen.queryByRole('heading', { name: /Eli Smith/ })).toBeNull();
	});

	it('files an unassigned Task under its creator, with no "Unassigned" column', () => {
		render(FamilyTasksPage, {
			...data([
				familyTask({ id: 'a', title: 'Nobody claimed this', assignedTo: null, userId: 'u_mom' })
			])
		});
		expect(screen.queryByText(/^Unassigned/)).toBeNull();
		const col = screen.getByRole('region', { name: /Maya Lopez’s open tasks/i });
		expect(within(col).getByText('Nobody claimed this')).toBeTruthy();
	});

	it('keeps the waiting-for-your-response banner and the two tabs', () => {
		render(FamilyTasksPage, {
			...data([
				familyTask({
					id: 'a',
					title: 'Take the bins out',
					assignedTo: 'u_dad',
					assignmentStatus: 'pending'
				})
			])
		});
		expect(screen.getByText(/1 task waiting for your response/i)).toBeTruthy();
		expect(screen.getByRole('tab', { name: /Family tasks/i })).toBeTruthy();
		expect(screen.getByRole('tab', { name: /Public tasks/i })).toBeTruthy();
	});

	it('still says so when the family has no open tasks', () => {
		render(FamilyTasksPage, { ...data([]) });
		expect(screen.getByText('No family tasks yet')).toBeTruthy();
	});
});
