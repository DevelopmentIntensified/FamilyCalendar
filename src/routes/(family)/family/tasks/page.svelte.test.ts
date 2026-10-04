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
		// The name and the count are two elements, as the prototype's
		// `.col__h` has them (`legend__count` is a sibling, not part of the
		// name) — but the column still has to carry the count.
		const yours = screen.getByRole('region', { name: /Your? open tasks|You’s open tasks/i });
		expect(within(yours).getByRole('heading', { name: 'You' })).toBeTruthy();
		expect(within(yours).getByText('2')).toBeTruthy();

		const mayas = screen.getByRole('region', { name: /Maya Lopez’s open tasks/i });
		expect(within(mayas).getByRole('heading', { name: 'Maya Lopez' })).toBeTruthy();
		expect(within(mayas).getByText('1')).toBeTruthy();

		// A family member with nothing assigned gets no column at all.
		expect(screen.queryByRole('heading', { name: /Eli Smith/ })).toBeNull();
	});

	it('gives unassigned Tasks a home of their own — the approved "Nobody" card', () => {
		// The owner overruled #101's creator fallback: the approved prototype
		// (`family-tasks.html`, the "Nobody" card) shows unassigned Tasks where
		// the board cannot see them, and says so. An approval is a spec.
		render(FamilyTasksPage, {
			...data([
				familyTask({ id: 'a', title: 'Nobody claimed this', assignedTo: null, userId: 'u_mom' })
			])
		});
		const nobody = screen.getByRole('region', { name: /nobody/i });
		expect(within(nobody).getByText('Nobody claimed this')).toBeTruthy();
		expect(within(nobody).getByText(/unassigned/i)).toBeTruthy();
	});

	it('does not double-count: an unassigned Task is in the Nobody card only', () => {
		render(FamilyTasksPage, {
			...data([
				familyTask({ id: 'a', title: 'Unclaimed', assignedTo: null, userId: 'u_mom' }),
				familyTask({ id: 'b', title: 'Claimed', assignedTo: 'u_mom', userId: 'u_mom' })
			])
		});
		const nobody = screen.getByRole('region', { name: /nobody/i });
		expect(within(nobody).getByText('Unclaimed')).toBeTruthy();
		expect(within(nobody).queryByText('Claimed')).toBeNull();
		// Maya's column carries only the task that is actually hers.
		const col = screen.getByRole('region', { name: /Maya Lopez’s open tasks/i });
		expect(within(col).queryByText('Unclaimed')).toBeNull();
		expect(within(col).getByText('Claimed')).toBeTruthy();
	});

	it('shows no Nobody card when everything is assigned', () => {
		render(FamilyTasksPage, {
			...data([familyTask({ id: 'a', title: 'Claimed', assignedTo: 'u_dad', userId: 'u_dad' })])
		});
		expect(screen.queryByRole('region', { name: /nobody/i })).toBeNull();
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

describe('family tasks page — the approved board (issue 124)', () => {
	// `family-tasks.html` is a BOARD: up to four columns across, each a bordered
	// white card with a large, non-uppercase name over it. Measured at 1440px the
	// prototype resolved to `296px 296px 296px 296px`; the app page measured
	// `480px 480px` with no border, no padding and an 11px uppercase heading.

	it('goes to four columns on a wide screen, the way the approved board does', () => {
		render(FamilyTasksPage, { ...data([familyTask({ id: 'a', assignedTo: 'u_dad' })]) });

		const board = screen.getByRole('region', { name: /open tasks by assignee/i });
		expect(board.getAttribute('class')).toContain('xl:grid-cols-4');
	});

	it('draws each column as a card, not a bare heading in the gutter', () => {
		render(FamilyTasksPage, {
			...data([familyTask({ id: 'a', title: 'Mow', assignedTo: 'u_mom', userId: 'u_mom' })])
		});

		const col = screen.getByRole('region', { name: /Maya Lopez’s open tasks/i });
		expect(col.getAttribute('data-board-column')).toBe('');
		expect(col.getAttribute('class')).toContain('rounded-2xl');
		expect(col.getAttribute('class')).toContain('border-slate-200');
		expect(col.getAttribute('class')).toContain('p-4');
	});

	it('names the person in a large plain heading, not an 11px uppercase label', () => {
		render(FamilyTasksPage, {
			...data([familyTask({ id: 'a', title: 'Mow', assignedTo: 'u_mom', userId: 'u_mom' })])
		});

		const heading = screen.getByRole('heading', { name: /Maya Lopez/ });
		expect(heading.getAttribute('class')).not.toContain('uppercase');
		expect(heading.getAttribute('class')).toContain('text-[15px]');
	});

	it('puts the overdue task at the top of its column, before the ones that are not', () => {
		// `family-tasks.html`: "the grouping is by person, the urgency is by
		// date" — it sorts each column so the overdue row is first. The app
		// printed them in insertion order, so a late task sat under a calm one.
		const past = new Date(Date.now() - 86400000).toISOString();
		const future = new Date(Date.now() + 6 * 86400000).toISOString();
		render(FamilyTasksPage, {
			...data([
				familyTask({
					id: 'calm',
					title: 'Book the boiler',
					dueDate: future,
					assignedTo: 'u_mom',
					userId: 'u_mom'
				}),
				familyTask({
					id: 'late',
					title: 'Take the bins out',
					dueDate: past,
					assignedTo: 'u_mom',
					userId: 'u_mom'
				})
			])
		});

		const col = screen.getByRole('region', { name: /Maya Lopez’s open tasks/i });
		const late = within(col).getByText(/Take the bins out/);
		const calm = within(col).getByText(/Book the boiler/);
		expect(late.compareDocumentPosition(calm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('washes the Nobody card blush, the way the approved card is washed', () => {
		// Measured: the prototype's is
		// `linear-gradient(140deg, rgba(254,202,202,.35), #fff)` over a #fecaca
		// border; the app card was flat white.
		render(FamilyTasksPage, {
			...data([familyTask({ id: 'a', title: 'Unclaimed', assignedTo: null, userId: 'u_mom' })])
		});

		const nobody = screen.getByRole('region', { name: /nobody/i });
		expect(nobody.getAttribute('class')).toContain('from-red-100/40');
	});
});
