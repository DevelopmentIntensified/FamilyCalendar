import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import TopPrioritiesCard from './TopPrioritiesCard.svelte';

/** Minimal row shape the card reads (superset of the required prop fields). */
interface Row {
	id: string;
	title: string;
	dueDate: string | null;
	priority: string;
	userId: string;
	assignedTo: string | null;
	assignmentStatus: string | null;
}

const base: Row = {
	id: 't1',
	title: 'Wash the car',
	dueDate: null,
	priority: 'normal',
	userId: 'u_me',
	assignedTo: null,
	assignmentStatus: null
};

describe('TopPrioritiesCard - task scoping labels (issue 021)', () => {
	it('labels a family task with the Family pill', () => {
		render(TopPrioritiesCard, {
			props: { tasks: [{ ...base, familyId: 'fam1' }], meId: 'u_me' }
		});
		expect(screen.getByText('Family')).toBeInTheDocument();
	});

	it('labels a personal public task with the 🌐 Public pill', () => {
		render(TopPrioritiesCard, {
			props: { tasks: [{ ...base, visibility: 'public' }], meId: 'u_me' }
		});
		expect(screen.getByText('🌐 Public')).toBeInTheDocument();
		expect(screen.queryByText('Family')).not.toBeInTheDocument();
	});

	it('labels a personal private task with the 🔒 Private pill', () => {
		render(TopPrioritiesCard, {
			props: { tasks: [{ ...base, visibility: 'private' }], meId: 'u_me' }
		});
		expect(screen.getByText('🔒 Private')).toBeInTheDocument();
	});

	it('shows an assigned badge when the task is assigned to someone else', () => {
		render(TopPrioritiesCard, {
			props: {
				tasks: [
					{
						...base,
						assignedTo: 'u_other',
						assigneeFirstName: 'Maya',
						assigneeLastName: 'Lopez'
					}
				],
				meId: 'u_me'
			}
		});
		expect(screen.getByText('→ Maya Lopez')).toBeInTheDocument();
	});

	it('keeps the plain You subline for tasks assigned to the viewer', () => {
		render(TopPrioritiesCard, {
			props: { tasks: [{ ...base, assignedTo: 'u_me' }], meId: 'u_me' }
		});
		expect(screen.getByText('You')).toBeInTheDocument();
		expect(screen.queryByText('→ Maya Lopez')).not.toBeInTheDocument();
	});
});
