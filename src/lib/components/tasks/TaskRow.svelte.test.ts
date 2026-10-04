import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import TaskRow from './TaskRow.svelte';

const baseTask = {
	id: 't1',
	title: 'Buy milk',
	notes: null,
	dueDate: null,
	completedAt: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	completionCount: null,
	assignedTo: null,
	assignmentStatus: null,
	priority: 'normal',
	familyId: null,
	visibility: 'public',
	assigneeFirstName: null,
	assigneeLastName: null,
	userId: 'u1',
	eventId: null,
	tags: []
};

function props(overrides = {}) {
	return {
		task: { ...baseTask },
		currentUserId: 'u1',
		assigneeName: '',
		busy: false,
		celebrating: false,
		confirmDelete: false,
		onToggle: vi.fn(),
		onEdit: vi.fn(),
		onAccept: vi.fn(),
		onDecline: vi.fn(),
		onAdvance: vi.fn(),
		onDelete: vi.fn(),
		onAskDelete: vi.fn(),
		onCancelDelete: vi.fn(),
		...overrides
	};
}

describe('TaskRow', () => {
	afterEach(cleanup);

	// The flat list dropped its Overdue heading (101), so the row itself has to
	// say how late it is. Fake timers pin "now" at 2026-09-30 10:00 local.
	const overdueAt = () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 8, 30, 10, 0, 0));
	};
	const realTimers = () => vi.useRealTimers();

	it('washes an overdue row and chips how late it is', () => {
		overdueAt();
		try {
			const p = props({
				task: { ...baseTask, dueDate: new Date(2026, 8, 28, 9, 0, 0).toISOString() }
			});
			const { container } = render(TaskRow, { props: p });
			expect(screen.getByText('2 days late')).toBeTruthy();
			// SAFETY: render() mounts the row as the container's only child element.
			expect((container.firstElementChild as HTMLElement).className).toMatch(/bg-red-50/);
			// The date still prints on the row — a chip is not a summary.
			expect(screen.getByText('Sep 28')).toBeTruthy();
		} finally {
			realTimers();
		}
	});

	it.each([
		['today', new Date(2026, 8, 30, 18, 0, 0)],
		['next week', new Date(2026, 9, 7, 9, 0, 0)],
		['undated', null]
	])('says nothing about lateness for a task due %s', (_when, due) => {
		overdueAt();
		try {
			render(TaskRow, {
				props: props({ task: { ...baseTask, dueDate: due?.toISOString() ?? null } })
			});
			expect(screen.queryByText(/late$/)).toBeNull();
		} finally {
			realTimers();
		}
	});

	it('renders the title and fires onEdit when the title is clicked', async () => {
		const p = props();
		render(TaskRow, { props: p });
		await fireEvent.click(screen.getByTitle('Edit task'));
		expect(p.onEdit).toHaveBeenCalledOnce();
	});

	it('fires onToggle when the complete button is clicked', async () => {
		const p = props();
		render(TaskRow, { props: p });
		await fireEvent.click(screen.getByLabelText('Complete task'));
		expect(p.onToggle).toHaveBeenCalledOnce();
	});

	it('shows due + priority chips when set', () => {
		const p = props({
			task: { ...baseTask, dueDate: '2026-09-10', priority: 'high' }
		});
		render(TaskRow, { props: p });
		expect(screen.getByText('High')).toBeTruthy();
	});

	it('shows accept/decline for my pending assignment', async () => {
		const p = props({
			task: { ...baseTask, assignedTo: 'u1', assignmentStatus: 'pending', userId: 'u2' }
		});
		render(TaskRow, { props: p });
		await fireEvent.click(screen.getByTitle('Accept'));
		expect(p.onAccept).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByTitle('Decline'));
		expect(p.onDecline).toHaveBeenCalledOnce();
	});

	it('asks then confirms delete across two steps', async () => {
		const ask = props();
		const { unmount } = render(TaskRow, { props: ask });
		await fireEvent.click(screen.getByLabelText('Delete task'));
		expect(ask.onAskDelete).toHaveBeenCalledOnce();
		unmount();

		const confirm = props({ confirmDelete: true });
		render(TaskRow, { props: confirm });
		await fireEvent.click(screen.getByText('Yes'));
		expect(confirm.onDelete).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('No'));
		expect(confirm.onCancelDelete).toHaveBeenCalledOnce();
	});

	it('shows the skip button for open recurring tasks and fires onAdvance', async () => {
		const p = props({
			task: { ...baseTask, recurrenceFrequency: 'weekly', recurrenceInterval: 1 }
		});
		render(TaskRow, { props: p });
		await fireEvent.click(screen.getByLabelText('Skip to next occurrence'));
		expect(p.onAdvance).toHaveBeenCalledOnce();
	});

	// tasks.html / b-tasks-flat.html, approved: "ONE baseline, ONE separator,
	// ONE height. The old meta line wrapped to two and three lines depending on
	// the title, which is what made the rows look ununiform. It never wraps
	// now: the row truncates, the title does." (#101 shipped the flat LIST; the
	// row it ships in the prototype was never built, so every fact had drifted
	// onto its own line and the rows varied in height with their content.)
	describe('the one meta line (tasks.html, b-tasks-flat.html)', () => {
		const crowded = {
			...baseTask,
			title: 'A title long enough that the row would otherwise wrap its meta line',
			dueDate: new Date(2026, 8, 28, 9, 0, 0).toISOString(),
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2,
			completionCount: 12,
			priority: 'high',
			familyId: 'f-rivera',
			notes: 'a note that would have been its own line',
			tags: ['groceries', 'errands', 'home', 'health']
		};

		it('carries every fact in ONE nowrap element of ONE height', () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2026, 8, 30, 10, 0, 0));
			try {
				render(TaskRow, { props: props({ task: crowded }) });
				const metas = screen.getAllByTestId('task-meta');
				expect(metas).toHaveLength(1);
				const meta = metas[0];
				// One baseline that never wraps: the LINE truncates, not the row.
				expect(meta.className).toContain('flex-nowrap');
				expect(meta.className).toContain('overflow-hidden');
				expect(meta.className).toContain('whitespace-nowrap');
				// ONE height, so a row with four tags is the same height as a
				// bare one.
				expect(meta.className).toContain('h-5');
				// And nothing else is a line of its own: title + meta, only.
				const body = meta.parentElement!;
				expect(body.children).toHaveLength(2);
				expect(body.children[0].tagName).toBe('BUTTON');
			} finally {
				vi.useRealTimers();
			}
		});

		it('a bare row is the same shape as a crowded one', () => {
			render(TaskRow, { props: props() });
			expect(screen.getAllByTestId('task-meta')).toHaveLength(1);
			expect(screen.getByTestId('task-meta').parentElement!.children).toHaveLength(2);
		});

		it('separates the slots with the prototype’s middot, not a stray bullet', () => {
			render(TaskRow, {
				props: props({
					task: { ...baseTask, dueDate: '2026-10-30', priority: 'high', tags: ['home'] }
				})
			});
			const meta = screen.getByTestId('task-meta');
			expect(meta.querySelectorAll('[data-slot="sep"]').length).toBeGreaterThan(0);
			for (const sep of Array.from(meta.querySelectorAll('[data-slot="sep"]'))) {
				expect(sep.textContent).toBe('·');
			}
		});

		it('says “unassigned” rather than printing nothing for an unowned row', () => {
			// The prototype's last slot: an avatar when there is a person, the
			// WORD “unassigned” when there is not. The app printed neither, so a
			// gap in the queue looked like a row that had been forgotten.
			render(TaskRow, { props: props() });
			expect(screen.getByText('unassigned')).toBeTruthy();
		});

		it('keeps the assignee chip and does NOT print “unassigned”', () => {
			render(TaskRow, {
				props: props({
					task: { ...baseTask, assignedTo: 'u2', assignmentStatus: 'accepted' },
					assigneeName: 'Sarah Rivera'
				})
			});
			expect(screen.queryByText('unassigned')).toBeNull();
			expect(screen.getByTitle('Assigned to Sarah Rivera')).toBeTruthy();
		});

		it('prints recurrence and its count as ONE slot, not two lines', () => {
			render(TaskRow, {
				props: props({
					task: {
						...baseTask,
						recurrenceFrequency: 'weekly',
						recurrenceInterval: 1,
						completionCount: 12,
						notes: 'a note'
					}
				})
			});
			const meta = screen.getByTestId('task-meta');
			expect(meta.textContent).toContain('every week');
			expect(meta.textContent).toContain('done 12×');
			// The note is not on the row at all when a recurrence says it, so it
			// cannot become a second line.
			expect(screen.queryByText('a note')).toBeNull();
		});
	});

	it('disables actions while busy', () => {
		const p = props({ busy: true });
		render(TaskRow, { props: p });
		// SAFETY: getByLabelText on a <button> always returns an HTMLButtonElement here.
		expect((screen.getByLabelText('Complete task') as HTMLButtonElement).disabled).toBe(true);
		// SAFETY: same — the delete affordance is a <button> in TaskRow.
		expect((screen.getByLabelText('Delete task') as HTMLButtonElement).disabled).toBe(true);
	});
});
