import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import AssignmentsCard from './AssignmentsCard.svelte';

const pending = [
	{
		id: 'p1',
		title: 'Take out trash',
		dueDate: '2026-09-10',
		familyId: 'f1',
		creatorFirstName: 'Ana',
		assignedTo: 'u1',
		assignmentStatus: 'pending'
	}
];
const requested = [
	{
		id: 'r1',
		title: 'Mow lawn',
		dueDate: null,
		familyId: null,
		creatorFirstName: null,
		assignedTo: 'u2',
		assignmentStatus: 'accepted'
	}
];

function props(overrides = {}) {
	return {
		pending: [...pending],
		requested: [...requested],
		busyId: null,
		formatDue: (d: string | null) => d ?? '',
		memberName: (id: string) => (id === 'u2' ? 'Bo Jones' : id),
		onRespond: vi.fn(),
		...overrides
	};
}

describe('AssignmentsCard', () => {
	afterEach(cleanup);

	it('shows pending with accept/decline and fires onRespond', async () => {
		const p = props();
		render(AssignmentsCard, { props: p });
		expect(screen.getByText('Take out trash')).toBeTruthy();
		await fireEvent.click(screen.getByTitle('Accept'));
		expect(p.onRespond).toHaveBeenCalledWith(pending[0], true);
		await fireEvent.click(screen.getByTitle('Decline'));
		expect(p.onRespond).toHaveBeenCalledWith(pending[0], false);
	});

	it('switches to the requested tab', async () => {
		const p = props();
		render(AssignmentsCard, { props: p });
		await fireEvent.click(screen.getByText(/Requested/));
		expect(screen.getByText('Mow lawn')).toBeTruthy();
		expect(screen.getByText('Accepted')).toBeTruthy();
	});

	it('shows the empty state when nothing is pending', () => {
		const p = props({ pending: [] });
		render(AssignmentsCard, { props: p });
		expect(screen.getByText(/all caught up/)).toBeTruthy();
	});

	it('disables actions while busy', () => {
		const p = props({ busyId: 'p1' });
		render(AssignmentsCard, { props: p });
		// SAFETY: the Accept affordance is a <button> in AssignmentsCard.
		expect((screen.getByTitle('Accept') as HTMLButtonElement).disabled).toBe(true);
	});
});
