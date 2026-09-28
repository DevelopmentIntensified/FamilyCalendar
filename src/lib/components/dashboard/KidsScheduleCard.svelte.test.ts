import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import KidsScheduleCard from './KidsScheduleCard.svelte';
import { avatarColor } from '$lib/utils/avatarColor';

afterEach(() => {
	cleanup();
});

/** One kids-schedule row: a day event plus the children attending it. */
function row(id: string, title: string, start: string, kids: { id: string; name: string }[]) {
	return {
		id,
		title,
		start,
		end: null,
		allDay: false,
		location: null,
		kids
	};
}

const MIA = { id: 'kid-mia', name: 'Mia' };
const ELI = { id: 'kid-eli', name: 'Eli' };

describe('KidsScheduleCard per-child grouping', () => {
	it('heads each child under their own name', () => {
		render(KidsScheduleCard, {
			props: {
				events: [
					row('e1', 'Soccer practice', '2026-09-28T16:30:00Z', [MIA]),
					row('e2', 'T-ball', '2026-09-28T16:45:00Z', [ELI])
				],
				isToday: true
			}
		});
		expect(screen.getByRole('heading', { name: 'Mia' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Eli' })).toBeInTheDocument();
	});

	it('repeats a shared event under every child attending it', () => {
		render(KidsScheduleCard, {
			props: {
				events: [row('e1', 'Swimming', '2026-09-28T16:30:00Z', [MIA, ELI])],
				isToday: true
			}
		});
		expect(screen.getAllByText('Swimming')).toHaveLength(2);
	});

	it('colours each child from their own id, not a shared chip', () => {
		const { container } = render(KidsScheduleCard, {
			props: {
				events: [
					row('e1', 'Soccer practice', '2026-09-28T16:30:00Z', [MIA]),
					row('e2', 'T-ball', '2026-09-28T16:45:00Z', [ELI])
				],
				isToday: true
			}
		});
		const mia = container.querySelector('[data-kid="kid-mia"]');
		const eli = container.querySelector('[data-kid="kid-eli"]');
		expect(mia?.className).toContain(avatarColor('kid-mia'));
		expect(eli?.className).toContain(avatarColor('kid-eli'));
	});

	it('shows the time and location on the row', () => {
		render(KidsScheduleCard, {
			props: {
				events: [
					{
						...row('e1', 'Soccer practice', '2026-09-28T16:30:00Z', [MIA]),
						location: 'Riverside Fields'
					}
				],
				isToday: true
			}
		});
		expect(screen.getByText(/Riverside Fields/)).toBeInTheDocument();
		// The card formats in the reader's own zone, so assert a time is shown
		// rather than a wall clock — pinning "4:30 PM" made this suite fail
		// anywhere that is not UTC.
		expect(screen.getByText(/\d{1,2}:\d{2}\s?(AM|PM)/i)).toBeInTheDocument();
	});

	it('says "All day" rather than a clock time for an all-day event', () => {
		render(KidsScheduleCard, {
			props: {
				events: [{ ...row('e1', 'School holiday', '2026-09-28T00:00:00Z', [MIA]), allDay: true }],
				isToday: true
			}
		});
		expect(screen.getByText('All day')).toBeInTheDocument();
	});
});

describe('KidsScheduleCard day-aware empty state', () => {
	it('labels today vs other days', () => {
		const { unmount } = render(KidsScheduleCard, { props: { events: [], isToday: true } });
		expect(screen.getByText("No kids' events today — free afternoon!")).toBeInTheDocument();
		unmount();
		render(KidsScheduleCard, { props: { events: [], isToday: false } });
		expect(screen.getByText("No kids' events this day")).toBeInTheDocument();
	});

	it('links the empty state to the family page', () => {
		render(KidsScheduleCard, { props: { events: [], isToday: true } });
		expect(screen.getByRole('link', { name: /view family/i })).toHaveAttribute('href', '/family');
	});
});
