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
});
