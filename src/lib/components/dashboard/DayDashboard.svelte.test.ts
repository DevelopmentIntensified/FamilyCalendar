import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/svelte';
import DayDashboard from './DayDashboard.svelte';
import { dashboardVisibility } from '$lib/dashboardModules';

afterEach(() => {
	cleanup();
});

/** A saved userSettings row's hidden list, run through the real composer. */
function modulesFor(hiddenDashboardModules: string[]) {
	return dashboardVisibility({
		settings: { showDailyVerse: true, hiddenDashboardModules },
		familySwitches: {}
	}).modules;
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

describe('DayDashboard — the viewed day (240)', () => {
	it('the glance card’s day-view link opens the viewed day, not today', () => {
		render(DayDashboard, {
			props: {
				...base,
				dateLabel: 'Thursday, November 5',
				isToday: false,
				dayDate: '2026-11-05',
				modules: modulesFor([])
			}
		});
		expect(screen.getByRole('link', { name: /open day view/i })).toHaveAttribute(
			'href',
			'/calendar?date=2026-11-05&view=day'
		);
	});

	it('the board header counts the board’s open tasks, not glance.openToday', () => {
		const t = (id: string) => ({
			id,
			title: `Task ${id}`,
			dueDate: null,
			completedAt: null,
			priority: 'normal',
			assignedTo: 'u-sarah',
			assignmentStatus: 'none',
			userId: 'u-sarah'
		});
		render(DayDashboard, {
			props: { ...base, familyTasks: [t('a'), t('b')], modules: modulesFor([]) }
		});
		expect(screen.getByText(/^2 open ·/)).toBeInTheDocument();
	});
});

describe('DayDashboard — board quick-add categories (#283)', () => {
	it('hands the viewer’s category names to the board’s quick-add', () => {
		render(DayDashboard, {
			props: {
				...base,
				modules: modulesFor([]),
				taskCategories: [
					{ id: 'c1', name: 'Errands' },
					{ id: 'c2', name: 'Home' }
				]
			}
		});
		// SAFETY: the Category field is an <input> in CategoryField.
		const input = screen.getByLabelText('Category') as HTMLInputElement;
		const names = [
			...document.querySelectorAll(`datalist#${input.getAttribute('list')} option`)
		].map((o) => o.getAttribute('value'));
		expect(names).toEqual(['Errands', 'Home']);
	});
});

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

/** A family with one open task, so the board and the family row both render. */
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

describe('DayDashboard — the Member strip is gone, the board stays (103)', () => {
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
		// querySelector's return type is Element; `within` wants an HTMLElement.
		const band = container.querySelector<HTMLElement>('[data-testid="dashboard-card-band"]')!;
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

// 118: three marks, one complaint — the card band did not know what deserves
// the top row. "This doesn't need to be as wide" (the board), "bring this to
// the layer above where the people box was" (kids), "move this up one layer"
// (groceries). The band is two groups now: the day's own reading, and the
// small family cards below it — the layer the Member Strip vacated, where the
// board is one cell rather than a banner. 316 re-cuts the ≥1024px tier into
// one two-column grid (below); the group structure and the 768–1023px
// glance/top-3 pairing are unchanged.
describe('DayDashboard — the band knows what deserves the top row (118)', () => {
	const layered = {
		...base,
		...withBoard,
		kidsSchedule: [],
		familyGroceries: [{ name: 'Whole milk', stores: ['Costco'] }],
		modules: modulesFor([])
	};

	it('is two groups, not a stack of full-width blocks', () => {
		render(DayDashboard, { props: layered });
		const band = screen.getByTestId('dashboard-card-band');
		expect(band.children).toHaveLength(2);
	});

	it('gives the day cards their own group, and the board is not in it', () => {
		render(DayDashboard, { props: layered });
		const band = screen.getByTestId('dashboard-card-band');
		const dayBand = within(band).getByTestId('dashboard-day-band');
		// 103's glance/top-3 pairing is the 768–1023px tier; at ≥1024px the
		// group hands its cards to the band's two-column grid (316).
		expect(dayBand.className).toContain('md:grid-cols-2');
		expect(dayBand.className).toContain('lg:contents');
		expect(within(dayBand).getByText('Today at a Glance')).toBeInTheDocument();
		expect(within(dayBand).getByText('Completed today')).toBeInTheDocument();
		expect(within(dayBand).queryByText('Family Task Board')).toBeNull();
		// Above everything else in the band.
		expect(band.firstElementChild).toBe(dayBand);
	});

	it('the board shares the small-family group with kids and groceries', () => {
		render(DayDashboard, { props: layered });
		const band = screen.getByTestId('dashboard-card-band');
		const row = within(band).getByTestId('dashboard-family-row');
		// "This doesn't need to be as wide": never a full-width card again.
		expect(row.className).toContain('lg:contents');
		expect(within(row).getByText('Family Task Board')).toBeInTheDocument();
		expect(within(row).getByText("Kids' Schedule")).toBeInTheDocument();
		expect(within(row).getByTestId('groceries-card')).toBeInTheDocument();
		// Three cells and none of them spanning: the board cannot read as the page.
		expect(row.children).toHaveLength(3);
		for (const cell of row.children) expect(cell.className).not.toContain('col-span');
	});

	it('a hidden card leaves its row; the row itself never goes empty', async () => {
		const { rerender } = render(DayDashboard, { props: layered });
		await rerender({ modules: modulesFor(['kids']) });
		expect(within(screen.getByTestId('dashboard-card-band')).getByTestId('dashboard-family-row').children).toHaveLength(2);
		// A solo viewer with no family and groceries switched off has no row at
		// all — an empty grid would still cost a 16px gap in the band.
		await rerender({ familyId: null, modules: modulesFor(['kids', 'groceries']) });
		expect(screen.queryByTestId('dashboard-family-row')).toBeNull();
	});
});

// 316 — the owner's screenshot: three-up rows left a vast blank column when a
// card was hidden, the board sat at the bottom, and row heights never
// reconciled. At ≥1024px the band is now ONE two-column grid: both groups go
// `display: contents`, so their cards flow two-up (glance | top-3,
// completed | board, kids | groceries) with no lane left empty, and the
// band's `items-stretch` gives every row one height.
describe('DayDashboard — the desktop band is one cohesive grid (316)', () => {
	const all = {
		...base,
		...withBoard,
		kidsSchedule: [],
		familyGroceries: [{ name: 'Whole milk', stores: ['Costco'] }],
		modules: modulesFor([])
	};

	const cardBand = (container: HTMLElement) =>
		container.querySelector<HTMLElement>('[data-testid="dashboard-card-band"]')!;

	it('flows six cards through a two-column grid at ≥1024px', () => {
		const { container } = render(DayDashboard, { props: all });
		const band = cardBand(container);
		expect(band.className).toContain('lg:grid-cols-2');
		expect(band.className).not.toContain('lg:grid-cols-3');
		// Both groups stop generating a box at lg, so their cards are the
		// grid's own items — in order, two per row, no dead third column.
		const dayBand = within(band).getByTestId('dashboard-day-band');
		const familyRow = within(band).getByTestId('dashboard-family-row');
		expect(dayBand.className).toContain('lg:contents');
		expect(familyRow.className).toContain('lg:contents');
		expect(dayBand.children).toHaveLength(3);
		expect(familyRow.children).toHaveLength(3);
	});

	it('shares one height per row (items-stretch), not items-start', () => {
		const { container } = render(DayDashboard, { props: all });
		const band = cardBand(container);
		expect(band.className).toContain('lg:items-stretch');
		expect(band.className).not.toContain('items-start');
		const cards = [
			...within(band).getByTestId('dashboard-day-band').children,
			...within(band).getByTestId('dashboard-family-row').children
		];
		// Three full desktop rows of two: no half-empty row at the end.
		expect(cards).toHaveLength(6);
		expect(cards.length % 2).toBe(0);
	});

	it('pins the whole ≥1024px branch', () => {
		// A snapshot the reader can diff: the band's classes and how many cells
		// each group contributes to it. If the desktop grid is re-cut again,
		// this fails on purpose.
		const { container } = render(DayDashboard, { props: all });
		const band = container.querySelector<HTMLElement>('[data-testid="dashboard-card-band"]')!;
		const dayBand = container.querySelector<HTMLElement>('[data-testid="dashboard-day-band"]')!;
		const familyRow = container.querySelector<HTMLElement>('[data-testid="dashboard-family-row"]')!;
		expect({
			band: { className: band.className.trim(), cells: band.children.length },
			day: { className: dayBand.className.trim(), cells: dayBand.children.length },
			family: { className: familyRow.className.trim(), cells: familyRow.children.length }
		}).toEqual({
			band: { className: 'grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch', cells: 2 },
			day: {
				className: 'grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:contents',
				cells: 3
			},
			family: { className: 'grid grid-cols-1 items-start gap-4 lg:contents', cells: 3 }
		});
	});

	it('keeps the ≤767px phone stack: one column, no desktop breakpoints', () => {
		const { container } = render(DayDashboard, { props: all });
		const band = cardBand(container);
		expect(band.className).toContain('grid-cols-1');
		expect(band.className).not.toContain('sm:grid-cols');
		const dayBand = within(band).getByTestId('dashboard-day-band');
		const familyRow = within(band).getByTestId('dashboard-family-row');
		// At phone width both groups are single-column stacks; the only two-up
		// tier below 1024px is 103's 768px glance/top-3 pairing.
		expect(dayBand.className).not.toContain('sm:grid-cols');
		expect(familyRow.className).not.toContain('sm:grid-cols');
		expect(familyRow.className).not.toContain('md:grid-cols');
	});
});

describe('DayDashboard — an absent module is VISIBLE, by the module’s own rule (109)', () => {
	it('renders the whole band when no visibility map is supplied at all', async () => {
		// Not "the loader happened to send one": `showsModule` states the
		// default, so a card the reader never hid cannot vanish with a missing
		// prop.
		const { rerender } = render(DayDashboard, {
			props: { ...base, familyTasks: [], modules: undefined }
		});
		const band = screen.getByTestId('dashboard-card-band');
		expect(within(band).getByText('Today at a Glance')).toBeInTheDocument();
		expect(within(band).getByText('Family Task Board')).toBeInTheDocument();
		// …and an explicit map saying the same thing changes nothing.
		await rerender({ modules: modulesFor([]) });
		expect(within(screen.getByTestId('dashboard-card-band')).getByText('Family Task Board')).toBeInTheDocument();
	});

	it('an untouched saved state renders identically to no state at all', () => {
		const bandText = () => screen.getByTestId('dashboard-card-band').textContent;
		render(DayDashboard, { props: { ...base, modules: undefined } });
		const withoutMap = bandText();
		cleanup();
		render(DayDashboard, { props: { ...base, modules: modulesFor([]) } });
		expect(bandText()).toBe(withoutMap);
		// Sanity: this harness can tell two states apart at all.
		cleanup();
		render(DayDashboard, { props: { ...base, modules: modulesFor(['verse', 'board']) } });
		expect(bandText()).not.toBe(withoutMap);
	});
});
