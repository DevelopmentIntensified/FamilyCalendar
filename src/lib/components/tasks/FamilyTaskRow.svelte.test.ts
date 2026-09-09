import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FamilyTaskRow from './FamilyTaskRow.svelte';

const open = {
	id: 't1',
	title: 'Mow lawn',
	notes: null,
	tags: [],
	dueDate: '2026-09-10',
	completedAt: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	completionCount: null,
	eventTitle: null,
	assignedTo: 'u1',
	assignmentStatus: 'pending',
	priority: 'high',
	familyId: 'f1',
	creatorFirstName: null,
	userId: 'u2'
};

function props(overrides = {}) {
	return {
		task: { ...open },
		variant: 'open',
		currentUserId: 'u1',
		canComplete: true,
		completeTitle: 'Complete task',
		assigneeName: 'You',
		overdue: false,
		busy: false,
		onToggle: vi.fn(),
		onAccept: vi.fn(),
		onDecline: vi.fn(),
		onAdvance: vi.fn(),
		onDelete: vi.fn(),
		...overrides
	};
}

describe('FamilyTaskRow', () => {
	afterEach(cleanup);

	it('open: toggles, accepts, and deletes (direct, no confirm)', async () => {
		const p = props();
		render(FamilyTaskRow, { props: p });
		await fireEvent.click(screen.getByLabelText('Complete task'));
		expect(p.onToggle).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByTitle('Accept'));
		expect(p.onAccept).toHaveBeenCalledOnce();
	});

	it('open: owner deletes directly with no confirm step', async () => {
		const p = props({ task: { ...open, userId: 'u1' } });
		render(FamilyTaskRow, { props: p });
		await fireEvent.click(screen.getByLabelText('Delete task'));
		expect(p.onDelete).toHaveBeenCalledOnce();
	});

	it('open: disables toggle with the explainer when not permitted', () => {
		const p = props({ canComplete: false, completeTitle: 'Only Ana can complete this' });
		render(FamilyTaskRow, { props: p });
		// SAFETY: the toggle affordance is a <button> in FamilyTaskRow.
		const btn = screen.getByLabelText('Complete task') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
		expect(btn.title).toBe('Only Ana can complete this');
	});

	it('open: shows waiting-for when someone else must accept', () => {
		const p = props({
			task: { ...open, assignedTo: 'u2', assignmentStatus: 'pending' },
			assigneeName: 'Bo'
		});
		render(FamilyTaskRow, { props: p });
		expect(screen.getByText(/waiting for Bo/)).toBeTruthy();
	});

	it('completed: struck title with mark-incomplete', async () => {
		const p = props({
			variant: 'completed',
			task: { ...open, completedAt: '2026-09-07T10:00:00Z' }
		});
		render(FamilyTaskRow, { props: p });
		await fireEvent.click(screen.getByLabelText('Mark incomplete'));
		expect(p.onToggle).toHaveBeenCalledOnce();
	});

	it('public: read-only, no action buttons', () => {
		const p = props({
			variant: 'public',
			task: { ...open, creatorFirstName: 'Ana' }
		});
		render(FamilyTaskRow, { props: p });
		expect(screen.getByText('by Ana')).toBeTruthy();
		expect(screen.queryByLabelText('Complete task')).toBeNull();
		expect(screen.queryByLabelText('Delete task')).toBeNull();
	});
});
