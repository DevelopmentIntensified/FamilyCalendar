import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/svelte';
import DayDashboard from './DayDashboard.svelte';
import { composeModuleVisibility } from '$lib/server/db/actions/dashboardModules';

afterEach(() => {
	cleanup();
});

/** A saved userSettings row's hidden list, run through the real composer. */
function modulesFor(hiddenDashboardModules: string[]) {
	return composeModuleVisibility({}, hiddenDashboardModules);
}

const verse = {
	reference: 'Psalm 127:1',
	text: 'Except the LORD build the house, they labour in vain.',
	attribution: 'ESV'
};

const base = {
	dateLabel: 'Tuesday, September 29',
	isToday: true,
	meId: 'u-sarah',
	familyId: 'f-rivera',
	glance: { doneToday: 2, openToday: 3, weekStreak: 4 },
	dayEvents: [],
	top3: [],
	familyTasks: [],
	familyMembers: [],
	kidsSchedule: []
};

describe('DayDashboard — the verse reads above the cards, not inside the band (080)', () => {
	it('puts the verse in the info band, outside the card band', () => {
		render(DayDashboard, {
			props: { ...base, dailyVerse: verse, modules: modulesFor([]) }
		});
		const band = screen.getByTestId('dashboard-info-band');
		const cards = screen.getByTestId('dashboard-card-band');
		expect(band.textContent).toContain(verse.text);
		// Above the cards, and not one of them.
		expect(cards.contains(band)).toBe(false);
		expect(band.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('a saved hidden state keeps the verse away', () => {
		// The saved state a user carries out of the pre-move dashboard: the
		// verse is on in settings, and its card was hidden for them.
		render(DayDashboard, {
			props: { ...base, dailyVerse: verse, modules: modulesFor(['verse']) }
		});
		expect(screen.queryByTestId('dashboard-info-band')).toBeNull();
		expect(screen.queryByText(verse.text)).toBeNull();
	});

	it('a saved visible state still shows it', () => {
		render(DayDashboard, {
			props: { ...base, dailyVerse: verse, modules: modulesFor(['board']) }
		});
		expect(screen.getByTestId('dashboard-info-band')).toBeInTheDocument();
	});

	it('no verse loaded means no empty info band', () => {
		render(DayDashboard, { props: { ...base, dailyVerse: null, modules: modulesFor([]) } });
		expect(screen.queryByTestId('dashboard-info-band')).toBeNull();
	});

	it('renders the cards the saved state leaves visible', () => {
		render(DayDashboard, {
			props: {
				...base,
				dailyVerse: verse,
				modules: modulesFor(['verse', 'board', 'kids'])
			}
		});
		expect(screen.getByTestId('dashboard-card-band').textContent).toContain('Today at a Glance');
		expect(screen.getByTestId('dashboard-card-band').textContent).not.toContain('Family Task');
	});
});

describe('DayDashboard — the Groceries card (081)', () => {
	const groceries = {
		familyGroceries: [{ name: 'Whole milk', stores: ['Costco'] }],
		mineGroceries: [{ name: 'Oat milk', stores: ['Costco'] }]
	};

	it('shows it in the card band when the module is on', () => {
		render(DayDashboard, { props: { ...base, ...groceries, modules: modulesFor([]) } });
		expect(within(screen.getByTestId('dashboard-card-band')).getByTestId('groceries-card')).toBeTruthy();
	});

	it('a saved hidden state removes it entirely', () => {
		render(DayDashboard, {
			props: { ...base, ...groceries, modules: modulesFor(['groceries']) }
		});
		expect(screen.queryByTestId('groceries-card')).toBeNull();
	});

	it('a family master switch off removes it for everyone', () => {
		const modules = { ...modulesFor([]), groceries: false };
		render(DayDashboard, { props: { ...base, ...groceries, modules } });
		expect(screen.queryByTestId('groceries-card')).toBeNull();
	});

	it('tells the card whether there is a family at all', async () => {
		const { rerender } = render(DayDashboard, {
			props: { ...base, ...groceries, modules: modulesFor([]) }
		});
		expect(within(screen.getByTestId('groceries-card')).getByTestId('groceries-scope-family')).toBeTruthy();
		await rerender({ familyId: null, familyGroceries: [], mineGroceries: [] });
		expect(within(screen.getByTestId('groceries-card')).queryByTestId('groceries-scope-family')).toBeNull();
	});
});

describe('DayDashboard — the Member strip is gone, the board stays (103)', () => {
	const withBoard = {
		familyTasks: [
			{
				id: 't1',
				title: 'Take out the bins',
				dueDate: '2026-09-29',
				completedAt: null,
				priority: 'normal',
				assignedTo: 'u-sarah',
				assignmentStatus: null,
				userId: 'u-sarah',
				assigneeFirstName: 'Sarah',
				assigneeLastName: 'Rivera',
				creatorFirstName: 'Sarah'
			}
		],
		familyMembers: [{ userId: 'u-sarah', firstName: 'Sarah', lastName: 'Rivera' }]
	};

	it('the Family Task Board still renders, and the strip does not', () => {
		render(DayDashboard, { props: { ...base, ...withBoard, modules: modulesFor([]) } });
		const band = screen.getByTestId('dashboard-card-band');
		expect(within(band).getByText('Family Task Board')).toBeInTheDocument();
		expect(within(band).queryByText('Today in the Family')).toBeNull();
		expect(within(band).queryByText(/open tasks? & events by member/i)).toBeNull();
	});

	it('the board is no longer sharing a two-column grid with a card', () => {
		// The strip and the board used to share one md:grid-cols-2 wrapper that
		// rendered when *either* was visible. With the strip gone the board is
		// the only thing left in it, so the wrapper goes and the board takes the
		// full width rather than sitting in a half-empty row. (The glance row
		// above it is still two columns — that pairing is intact.)
		const { container } = render(DayDashboard, {
			props: { ...base, ...withBoard, modules: modulesFor([]) }
		});
		const band = container.querySelector('[data-testid="dashboard-card-band"]')!;
		let node = within(band).getByText('Family Task Board').parentElement;
		while (node && node !== band) {
			expect(node.className).not.toContain('md:grid-cols-2');
			node = node.parentElement;
		}
		expect(band.querySelectorAll('.md\\:grid-cols-2')).toHaveLength(1);
	});

	it('a saved hidden list naming the retired strip leaves the board visible', () => {
		// The state a real user carries: they hid the strip before it was
		// retired. The board is not a casualty of their saved id.
		render(DayDashboard, {
			props: { ...base, ...withBoard, modules: modulesFor(['memberStrip']) }
		});
		expect(within(screen.getByTestId('dashboard-card-band')).getByText('Family Task Board')).toBeInTheDocument();
	});

	it('a saved hidden state for the board still hides the board', () => {
		render(DayDashboard, {
			props: { ...base, ...withBoard, modules: modulesFor(['memberStrip', 'board']) }
		});
		expect(within(screen.getByTestId('dashboard-card-band')).queryByText('Family Task Board')).toBeNull();
	});

	it('no family, no board — the strip was never the reason that gate existed', () => {
		render(DayDashboard, {
			props: { ...base, ...withBoard, familyId: null, modules: modulesFor([]) }
		});
		expect(within(screen.getByTestId('dashboard-card-band')).queryByText('Family Task Board')).toBeNull();
	});
});
