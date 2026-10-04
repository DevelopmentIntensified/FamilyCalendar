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

	it('shows what you asked for without anything having to be clicked', async () => {
		const p = props();
		render(AssignmentsCard, { props: p });
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

	// tasks.html, approved, on both counts: "The real AssignmentsCard is a
	// tabbed card... Tabs hide half the band, so this resolves them into two
	// stacked sections inside one card — every row framed, 8px between rows,
	// and Accept and Decline as two labelled buttons rather than a labelled
	// Accept beside a bare ✕." b-tasks-flat.html keeps the same band.
	describe('one band, two stacked sections — not a tab that hides half of it', () => {
		it('has no tablist at all, and both lists are on screen together', () => {
			render(AssignmentsCard, { props: props() });
			expect(screen.queryByRole('tablist')).toBeNull();
			expect(screen.queryByRole('tab')).toBeNull();
			// Nothing to click to reveal: both halves are already there.
			expect(screen.getByText('Take out trash')).toBeTruthy();
			expect(screen.getByText('Mow lawn')).toBeTruthy();
			expect(screen.getByText('Accepted')).toBeTruthy();
		});

		it('names both sections, with their counts', () => {
			render(AssignmentsCard, { props: props() });
			expect(screen.getByText('To accept (1)')).toBeTruthy();
			expect(screen.getByText('You asked for (1)')).toBeTruthy();
		});

		it('counts everything waiting in the band title', () => {
			render(AssignmentsCard, { props: props() });
			expect(screen.getByText('2 waiting')).toBeTruthy();
		});

		it('gives the two answers their OWN line, below the title', () => {
			const { container } = render(AssignmentsCard, { props: props() });
			const row = container.querySelector('[data-testid="inbox-row"]')!;
			const actions = row.querySelector('[data-testid="inbox-respond"]')!;
			// The affordance is the point of this band, so it gets a line of its
			// own rather than a column of buttons squeezing the title.
			expect(actions.children).toHaveLength(2);
			expect((actions.textContent ?? '')).toContain('✓ Accept');
			expect((actions.textContent ?? '')).toContain('✕ Decline');
			// …and it is not the same element as the title block.
			expect(actions.tagName).toBe('DIV');
		});

		it('keeps each empty state instead of hiding the section', () => {
			cleanup();
			render(AssignmentsCard, { props: props({ pending: [], requested: [] }) });
			expect(screen.getByText('To accept (0)')).toBeTruthy();
			expect(screen.getByText('You asked for (0)')).toBeTruthy();
			expect(screen.getByText(/all caught up/)).toBeTruthy();
		});
	});
});
