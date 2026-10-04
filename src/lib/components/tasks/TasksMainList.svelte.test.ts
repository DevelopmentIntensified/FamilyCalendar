import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import TasksMainList from './TasksMainList.svelte';
import type { TaskChip } from './TaskToolbar.svelte';
import type { TaskSortKey } from '$lib/utils/taskSort';

/**
 * Task titles in the order the flat list renders them. Both row components
 * root their markup in a `div.group`; the title is the edit button on an open
 * row and the struck-through line on a finished one.
 */
const renderedTitles = () =>
	[...document.querySelectorAll('div.group')].map(
		(row) =>
			row.querySelector('button[title="Edit task"]')?.textContent?.trim() ??
			row.querySelector('p')?.textContent?.trim() ??
			''
	);

const task = (overrides = {}) => ({
	id: 't1',
	title: 'Buy milk',
	notes: null,
	dueDate: null,
	completedAt: null,
	assignedTo: null,
	assignmentStatus: null,
	priority: null,
	familyId: null,
	assigneeFirstName: null,
	userId: 'u1',
	eventTitle: null,
	tags: [],
	...overrides
});

/** Typed up front so the fixture keeps the literal keys the props need. */
const ALL_CHIP: TaskChip = 'all';
const URGENCY: TaskSortKey = 'urgency';

function props(overrides = {}) {
	return {
		chip: ALL_CHIP,
		searchQuery: '',
		sortBy: URGENCY,
		tagFilter: '',
		confirmClear: false,
		openCount: 1,
		completedCount: 0,
		completedThisWeek: 0,
		filteredOpen: [task()],
		filteredCompleted: [],
		currentUserId: 'u1',
		busyId: null,
		celebratingId: null,
		confirmDeleteId: null,
		clearBusy: false,
		assigneeName: () => '',
		onToggle: vi.fn(),
		onEdit: vi.fn(),
		onRespond: vi.fn(),
		onAdvance: vi.fn(),
		onDelete: vi.fn(),
		onAskDelete: vi.fn(),
		onCancelDelete: vi.fn(),
		onBeginClear: vi.fn(),
		onCancelClear: vi.fn(),
		onClearCompleted: vi.fn(),
		...overrides
	};
}

describe('TasksMainList', () => {
	afterEach(cleanup);

	it('renders open rows', () => {
		render(TasksMainList, { props: props() });
		expect(screen.getByText('Buy milk')).toBeTruthy();
	});

	it('shows empty state when no tasks', () => {
		render(TasksMainList, { props: props({ filteredOpen: [], openCount: 0 }) });
		expect(screen.getByText('No tasks yet')).toBeTruthy();
	});

	it('forwards row toggle', async () => {
		const p = props();
		render(TasksMainList, { props: p });
		await fireEvent.click(screen.getByLabelText('Complete task'));
		expect(p.onToggle).toHaveBeenCalledWith('t1');
	});

	// ── issue 101, decision 2: the flat list ────────────────────────────────
	describe('flat, no bands', () => {
		// "Now" is 2026-09-30 10:00 local so the buckets below are exact.
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(2026, 8, 30, 10, 0, 0));
		});
		afterEach(() => vi.useRealTimers());

		const at = (days: number, hour = 9) => {
			const d = new Date(2026, 8, 30, hour, 0, 0);
			d.setDate(d.getDate() + days);
			return d.toISOString();
		};

		const board = (sortKey: TaskSortKey = URGENCY) =>
			props({
				sortBy: sortKey,
				openCount: 3,
				completedCount: 1,
				filteredOpen: [
					task({ id: 't1', title: 'Books', dueDate: at(4) }),
					task({ id: 't2', title: 'Milk', dueDate: at(-2) }),
					task({ id: 't3', title: 'Mow', dueDate: at(0, 18) })
				],
				filteredCompleted: [task({ id: 't4', title: 'Rent', dueDate: at(-30), completedAt: at(0) })]
			});

		it('has no band heading anywhere — one run of rows', () => {
			render(TasksMainList, { props: board() });
			expect(renderedTitles()).toEqual(['Milk', 'Mow', 'Books', 'Rent']);
			expect(screen.queryByText(/^Open \(/)).toBeNull();
			expect(screen.queryByText(/^Completed \(/)).toBeNull();
			expect(screen.queryByText(/^Overdue \(\d+\)$/)).toBeNull();
		});

		it('has no sticky header — the list is one plain run', () => {
			render(TasksMainList, { props: board() });
			expect(document.querySelector('.sticky')).toBeNull();
		});

		it('prints the counts the headings used to carry, on the jump bar', () => {
			render(TasksMainList, { props: board() });
			const JUMP_BAR: { label: string; n: number }[] = [
				{ label: 'All', n: 4 },
				{ label: 'Overdue', n: 1 },
				{ label: 'Today', n: 1 },
				{ label: 'Up next', n: 1 },
				{ label: 'Done', n: 1 }
			];
			for (const { label, n } of JUMP_BAR) {
				expect(screen.getByRole('button', { name: new RegExp(`^${label}\\s*${n}$`) })).toBeTruthy();
			}
		});

		it('makes time a filter state, not a section', async () => {
			render(TasksMainList, { props: board() });
			await fireEvent.click(screen.getByRole('button', { name: /^Overdue\s*1$/ }));
			expect(renderedTitles()).toEqual(['Milk']);
			await fireEvent.click(screen.getByRole('button', { name: /^All\s*4$/ }));
			expect(renderedTitles()).toEqual(['Milk', 'Mow', 'Books', 'Rent']);
		});

		it('says so, and offers a way back, when the filter has nothing in it', async () => {
			render(TasksMainList, { props: props({ filteredOpen: [task({ id: 't1' })] }) });
			await fireEvent.click(screen.getByRole('button', { name: /^Overdue\s*0$/ }));
			expect(screen.getByText(/nothing overdue right now/i)).toBeTruthy();
			await fireEvent.click(screen.getByRole('button', { name: /show all 1/i }));
			expect(screen.getByText('Buy milk')).toBeTruthy();
		});

		it('still sorts by the sort control when asked for A–Z', () => {
			render(TasksMainList, { props: board('title') });
			expect(renderedTitles()).toEqual(['Books', 'Milk', 'Mow', 'Rent']);
		});
	});
});

/**
 * `tasks.html`'s approved owner axis, on the flat list. Two of these are
 * reconciliations rather than transcriptions, and each says so in the test that
 * pins it: the prototype's third chip misnamed its own predicate, and its
 * `Open` bucket would have undone b-tasks-flat's decision that finished work
 * sorts LAST rather than disappearing.
 */
describe('TasksMainList — the approved owner axis (tasks.html)', () => {
	afterEach(cleanup);

	const queue = () =>
		props({
			openCount: 3,
			completedCount: 1,
			// u1 is the viewer. `a` is hers; `b` and `d` were handed TO her by
			// somebody else, which is the other approved bucket.
			filteredOpen: [
				task({ id: 'a', title: 'Mine: bins', assignedTo: null, userId: 'u1' }),
				task({ id: 'b', title: 'Theirs: roof', assignedTo: 'u1', userId: 'u2' }),
				task({ id: 'c', title: 'Nobody: hose', assignedTo: null })
			],
			filteredCompleted: [
				task({
					id: 'd',
					title: 'Finished thing',
					assignedTo: 'u1',
					userId: 'u2',
					completedAt: '2026-09-01'
				})
			]
		});

	it('opens on Open, which is the whole queue — finished work still sorts last', async () => {
		// b-tasks-flat is approved too, and its decision is that finished work is
		// NOT hidden: "the list is flat, but finished work is not work". So the
		// default chip narrows nothing, and `Done` is the bucket that shows the
		// finished rows alone.
		render(TasksMainList, { props: queue() });
		expect(renderedTitles()).toHaveLength(4);
		expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('Mine is the tasks handed to me, exactly as the prototype filters them', async () => {
		// tasks.html:167 — `if (chip === 'mine') return !t.completedAt && t.assignedTo === 'u_jon'`.
		// So `Mine` is assigned-to-me, not created-by-me. The roof and the finished
		// thing were both handed to her; `a` and `c` are hers by authorship but
		// nobody's job yet, so they belong to `Created by me`.
		render(TasksMainList, { props: queue() });
		await fireEvent.click(screen.getByRole('button', { name: 'Mine' }));
		expect(renderedTitles()).toEqual(['Theirs: roof', 'Finished thing']);
	});

	it('Created by me is the authorship column, under the name it actually has', async () => {
		// The prototype labelled this column "Assigned to me" while filtering
		// `assignedTo !== viewer` — everybody ELSE's. Renamed rather than
		// shipped as a control that lies about what it does.
		render(TasksMainList, { props: queue() });
		await fireEvent.click(screen.getByRole('button', { name: 'Created by me' }));
		expect(renderedTitles()).toEqual(['Mine: bins', 'Nobody: hose']);
	});

	it('the approved vocabulary, each chip true of what it names', async () => {
		// tasks.html, approved, prints Open / Mine / Assigned to me / Done. Its
		// own code made the third a lie — labelled "Assigned to me", filtering
		// `assignedTo !== viewer` — so the owner's ruling keeps the labels and
		// fixes that one name to `Created by me`. The other three are verbatim.
		const p = queue();
		render(TasksMainList, { props: p });

		await fireEvent.click(screen.getByRole('button', { name: 'Mine' }));
		expect(renderedTitles()).toEqual(['Theirs: roof', 'Finished thing']);

		await fireEvent.click(screen.getByRole('button', { name: 'Created by me' }));
		expect(renderedTitles()).toEqual(['Mine: bins', 'Nobody: hose']);

		await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		expect(renderedTitles()).toEqual(['Finished thing']);

		await fireEvent.click(screen.getByRole('button', { name: 'Open' }));
		expect(renderedTitles()).toEqual([
			'Mine: bins',
			'Nobody: hose',
			'Theirs: roof',
			'Finished thing'
		]);
	});

	it('the unowned bucket is still reachable — through Open, where it belongs', async () => {
		render(TasksMainList, { props: queue() });
		await fireEvent.click(screen.getByRole('button', { name: 'Open' }));
		expect(renderedTitles()).toContain('Nobody: hose');
	});

	it('Done shows the finished rows alone', async () => {
		render(TasksMainList, { props: queue() });
		await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		expect(renderedTitles()).toEqual(['Finished thing']);
	});

	it('titles the filter line with what is left, so the chips are never silent', async () => {
		render(TasksMainList, { props: queue() });
		expect(screen.getByTestId('task-filter-count')).toHaveTextContent('4 tasks');
		await fireEvent.click(screen.getByRole('button', { name: 'Mine' }));
		expect(screen.getByTestId('task-filter-count')).toHaveTextContent('2 tasks');
		await fireEvent.click(screen.getByRole('button', { name: 'Created by me' }));
		expect(screen.getByTestId('task-filter-count')).toHaveTextContent('2 tasks');
	});

	it('never claims an account has no tasks while a filter is switched on', async () => {
		render(TasksMainList, {
			props: props({
				filteredOpen: [task({ id: 'a', title: 'Theirs: roof', assignedTo: 'u1', userId: 'u2' })],
				filteredCompleted: []
			})
		});
		// The one row is handed to her but authored by somebody else, so `Mine`
		// matches it and `Created by me` matches nothing. Filter to nothing.
		await fireEvent.click(screen.getByRole('button', { name: 'Created by me' }));
		// "No matching tasks", not "No tasks yet" — the account has plenty.
		expect(screen.getByText('No matching tasks')).toBeTruthy();
		expect(screen.queryByText('No tasks yet')).toBeNull();
	});
});