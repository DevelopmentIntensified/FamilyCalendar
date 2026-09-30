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
	memberStatus: [],
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
