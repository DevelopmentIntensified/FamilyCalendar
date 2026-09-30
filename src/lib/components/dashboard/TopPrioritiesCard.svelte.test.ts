import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TopPrioritiesCard from './TopPrioritiesCard.svelte';
import { pushToast } from '$lib/client/toasts';
import { measureBox, MIN_TOUCH } from '$lib/utils/touchTarget';

// oxlint-disable-next-line anti-slop/no-module-mocking -- toast store is global side-effect state; spying keeps assertions local.
vi.mock('$lib/client/toasts', () => ({ pushToast: vi.fn() }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

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

// Issue 015: the priority chips were `px-2.5 py-1.5 text-[11px]` = 25.2px tall,
// thumbed on the Day Dashboard. The chips sit in a wrapping flex row, so a
// min-height grows them without pushing the card wider.
describe('TopPrioritiesCard priority chip touch targets', () => {
	it('gives every priority chip a 44px target', () => {
		render(TopPrioritiesCard, { props: { tasks: [{ ...base }], meId: 'u_me' } });
		for (const label of ['Low', 'Normal', 'High']) {
			// SAFETY: each priority chip is a <button> in TopPrioritiesCard.
			const chip = screen.getByRole('button', { name: `Set priority ${label}` });
			expect(measureBox(chip.className).height).toBe(MIN_TOUCH);
		}
	});
});

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

describe('TopPrioritiesCard - charm empty state + toast voice', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	it('names the all-clear with a tasks deep link', () => {
		render(TopPrioritiesCard, { props: { tasks: [], meId: 'u_me' } });
		expect(screen.getByText('All clear — nothing needs you right now.')).toBeInTheDocument();
		// Footer link + the empty-state CTA both point at the task list.
		const links = screen.getAllByRole('link', { name: /view all tasks/i });
		expect(links).toHaveLength(2);
		for (const a of links) expect(a).toHaveAttribute('href', '/calendar/tasks');
	});

	it('quotes the task title in the priority toast', async () => {
		// SAFETY: the stub satisfies only the ok/json surface the component reads.
		const ok = { ok: true, json: () => Promise.resolve({}) } as Response;
		vi.mocked(fetch).mockResolvedValue(ok);
		render(TopPrioritiesCard, { props: { tasks: [{ ...base }], meId: 'u_me' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Set priority High' }));
		await waitFor(() =>
			expect(pushToast).toHaveBeenCalledWith({
				message: 'Priority for "Wash the car" set to High.'
			})
		);
	});
});
