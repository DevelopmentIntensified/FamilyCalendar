import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import FamilyTaskBoardCard from './FamilyTaskBoardCard.svelte';

const createMockLocalStorage = () => ({
	getItem: vi.fn(() => null),
	setItem: vi.fn()
});

/** Shape the component actually reads from `fetch` responses. */
type StubResponse<T = void> = {
	ok: true;
	json: () => Promise<T>;
};

function fetchStub<T>(payload: T): StubResponse<T> {
	return { ok: true, json: () => Promise.resolve(payload) };
}

function stubFetchResponse<T>(payload: T): Response {
	// SAFETY: the stub satisfies only the ok/json surface the component reads;
	// the Response cast is centralized here instead of every call site.
	return fetchStub(payload) as Response;
}

/** True when a fetch init body is a string payload. */
function isStringBody(v: unknown): v is string {
	return typeof v === 'string';
}

const members = [
	{ userId: 'u_mom', firstName: 'Maya', lastName: 'Lopez' },
	{ userId: 'u_dad', firstName: 'Dad', lastName: 'Smith' }
];

describe('FamilyTaskBoardCard - quick-add scoping (issue 021)', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
		vi.stubGlobal('localStorage', createMockLocalStorage());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	async function renderBoard() {
		render(FamilyTaskBoardCard, {
			props: { tasks: [], members, meId: 'u_me', familyId: 'fam1' }
		});
	}

	const taskPosts = () =>
		vi
			.mocked(fetch)
			.mock.calls.filter(([u, init]) => String(u) === '/api/tasks' && init?.method === 'POST');

	const taskBody = () => {
		const posts = taskPosts();
		if (posts.length !== 1) throw new Error(`Expected 1 task POST, got ${posts.length}`);
		const raw = posts[0][1]?.body;
		return JSON.parse(isStringBody(raw) ? raw : '{}');
	};

	it('assigns to a roster member with @name and keeps the family scope', async () => {
		vi.mocked(fetch).mockResolvedValue(stubFetchResponse({ task: { id: 't1' } }));
		await renderBoard();

		await fireEvent.input(screen.getByPlaceholderText(/saturday for dad/i), {
			target: { value: '@maya buy milk' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		await waitFor(() => expect(taskPosts()).toHaveLength(1));

		const body = taskBody();
		expect(body.assignedTo).toBe('u_mom');
		expect(body.familyId).toBe('fam1');
		expect(body.title).toBe('buy milk');
	});

	it('blocks an unknown @member with an inline error instead of silently dropping it', async () => {
		await renderBoard();

		await fireEvent.input(screen.getByPlaceholderText(/saturday for dad/i), {
			target: { value: '@zorro buy milk' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));

		expect(taskPosts()).toHaveLength(0);
		expect(await screen.findByText(/unknown member/i)).toBeInTheDocument();
	});

	it.each([
		['#private wash the car', 'wash the car'],
		['#public sweep the porch', 'sweep the porch']
	])(
		'strips %s from the title and keeps family scoping (visibility not sent)',
		async (raw, title) => {
			vi.mocked(fetch).mockResolvedValue(stubFetchResponse({ task: { id: 't1' } }));
			await renderBoard();

			await fireEvent.input(screen.getByPlaceholderText(/saturday for dad/i), {
				target: { value: raw }
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
			await waitFor(() => expect(taskPosts()).toHaveLength(1));

			const body = taskBody();
			expect(body.title).toBe(title);
			expect(body.familyId).toBe('fam1');
			// Family tasks don't use visibility (issue 019) — the board never sends it.
			expect(body.visibility).toBeUndefined();
		}
	);

	it('shows the quick-add help panel next to the input', async () => {
		await renderBoard();
		await fireEvent.click(screen.getByRole('button', { name: 'Quick-add shortcuts help' }));
		expect(screen.getByText(/type these right in the title/i)).toBeInTheDocument();
	});

	it('names the calm empty state with a tasks deep link', async () => {
		await renderBoard();
		expect(screen.getByText('No open family tasks — enjoy the calm 👪.')).toBeInTheDocument();
		// Header link + the empty-state CTA both point at the task list.
		const links = screen.getAllByRole('link', { name: /view all tasks/i });
		expect(links).toHaveLength(2);
		for (const a of links) expect(a).toHaveAttribute('href', '/calendar/tasks');
	});

	it('invites starting a streak when there is none', async () => {
		await renderBoard();
		expect(screen.getByText(/Start a streak — check off today's tasks 🔥/)).toBeInTheDocument();
		expect(screen.queryByText(/no streak yet/i)).not.toBeInTheDocument();
	});
});

// Issue 101, decision 1: the card is the Family Task Board, so it groups by
// assignee (falling back to the creator) and prints each person's open count —
// the number the card exists to show. The rule itself is unit-tested in
// src/lib/utils/familyTaskGroups.test.ts; this pins the wiring.
describe('FamilyTaskBoardCard - grouped by assignee', () => {
	type BoardTask = {
		id: string;
		title: string;
		dueDate: string | null;
		completedAt: string | null;
		priority: string;
		assignedTo: string | null;
		assignmentStatus: string | null;
		userId: string;
	};

	const openTask = (overrides = {}): BoardTask => ({
		id: 't1',
		title: 'Mow the lawn',
		dueDate: null,
		completedAt: null,
		priority: 'normal',
		assignedTo: null,
		assignmentStatus: 'none',
		userId: 'u_dad',
		...overrides
	});

	function renderWith(tasks: BoardTask[]) {
		render(FamilyTaskBoardCard, {
			props: { tasks, members, meId: 'u_me', familyId: 'fam1' }
		});
	}

	afterEach(cleanup);

	it('gives each assignee a heading carrying their open-task count', () => {
		renderWith([
			openTask({ id: 'a', title: 'Mow', assignedTo: 'u_dad' }),
			openTask({ id: 'b', title: 'Cook', assignedTo: 'u_dad' }),
			openTask({ id: 'c', title: 'Read', assignedTo: 'u_mom', userId: 'u_mom' })
		]);
		expect(screen.getByRole('heading', { name: /Dad Smith · 2/i })).toBeTruthy();
		expect(screen.getByRole('heading', { name: /Maya Lopez · 1/i })).toBeTruthy();
	});

	it('files an unassigned Task under the person who created it', () => {
		renderWith([
			openTask({ id: 'a', title: 'Nobody claimed this', assignedTo: null, userId: 'u_mom' })
		]);
		// No "Unassigned" heading: the documented fallback is the creator.
		expect(screen.queryByText(/unassigned/i)).toBeNull();
		expect(screen.getByRole('heading', { name: /Maya Lopez · 1/i })).toBeTruthy();
		expect(screen.getByText('Nobody claimed this')).toBeTruthy();
	});

	it('gives a family member with nothing assigned no heading', () => {
		renderWith([openTask({ id: 'a', assignedTo: 'u_dad' })]);
		expect(screen.getByRole('heading', { name: /Dad Smith · 1/i })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: /Maya Lopez/ })).toBeNull();
	});

	it('puts the most overdue Task at the top of a column', () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date(2026, 8, 30, 10, 0, 0));
			renderWith([
				openTask({ id: 'a', title: 'Later', dueDate: '2026-10-04T09:00:00.000Z' }),
				openTask({ id: 'b', title: 'Overdue', dueDate: '2026-09-25T09:00:00.000Z' }),
				openTask({ id: 'c', title: 'Undated' })
			]);
			const order = [...document.querySelectorAll('section p')].map((p) => p.textContent?.trim());
			expect(order).toEqual(['Overdue', 'Later', 'Undated']);
		} finally {
			vi.useRealTimers();
		}
	});
});
