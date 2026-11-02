import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { invalidateAll } from '$app/navigation';
import AddTaskCard from './AddTaskCard.svelte';

// oxlint-disable-next-line anti-slop/no-module-mocking -- DI seam impossible: `$app/navigation` is a SvelteKit virtual module imported inside AddTaskCard.
vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(() => Promise.resolve()),
	goto: vi.fn()
}));

function props(overrides = {}) {
	return {
		familyRoster: [],
		familyId: null,
		memberName: (id: string) => id,
		formatDue: (d: string | null) => d ?? '',
		onError: vi.fn(),
		...overrides
	};
}

describe('AddTaskCard', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: true, json: async () => ({}) }))
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('submits the parsed title and refreshes', async () => {
		const p = props();
		render(AddTaskCard, { props: p });
		await fireEvent.input(screen.getByPlaceholderText(/Buy milk tomorrow/), {
			target: { value: 'Buy milk' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
		expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
		// SAFETY: the stubbed fetch is called with (url, { body }) in addTask.
		const requestBody = vi.mocked(fetch).mock.calls[0]?.[1]?.body;
		expect(requestBody).toBeDefined();
		const body = JSON.parse(requestBody as string);
		expect(body.title).toBe('Buy milk');
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it('passes the created task to onAdded for instant display', async () => {
		const created = { id: 't1', title: 'Buy milk', tags: [] };
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ task: created })
		} as unknown as Response);
		const onAdded = vi.fn();
		render(AddTaskCard, { props: { ...props(), onAdded } });
		await fireEvent.input(screen.getByPlaceholderText(/Buy milk tomorrow/), {
			target: { value: 'Buy milk' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
		await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
		expect(onAdded).toHaveBeenCalledWith(created);
	});

	it('blocks unknown @members without fetching', async () => {
		const p = props({
			familyRoster: [{ userId: 'u1', firstName: 'Ana', lastName: 'A' }]
		});
		render(AddTaskCard, { props: p });
		await fireEvent.input(screen.getByPlaceholderText(/Buy milk tomorrow/), {
			target: { value: 'Call @zed tomorrow' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
		expect(p.onError).toHaveBeenCalledWith(expect.stringContaining('zed'));
	});

	it('adds a smart template on tap', async () => {
		const p = props();
		render(AddTaskCard, { props: p });
		await fireEvent.click(screen.getByText(/Smart tasks/));
		const first = screen.getAllByTitle(/Every /)[0];
		await fireEvent.click(first);
		expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
		await waitFor(() => expect(invalidateAll).toHaveBeenCalledOnce());
	});

	describe('category (#280)', () => {
		const bodies = () =>
			// SAFETY: the stubbed fetch is called with (url, { body }) in submitTaskQuickAdd.
			vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1]?.body as string));

		it('offers the viewer categories under More and sends the chosen one', async () => {
			render(AddTaskCard, { props: props({ categories: ['Errands', 'Work'] }) });
			await fireEvent.click(screen.getByRole('button', { name: 'More' }));
			// SAFETY: the Category field is an <input> in CategoryField.
			const input = screen.getByLabelText('Category') as HTMLInputElement;
			const options = [
				...document.querySelectorAll(`datalist#${input.getAttribute('list')} option`)
			];
			expect(options).toHaveLength(2);
			await fireEvent.input(input, { target: { value: 'Work' } });
			await fireEvent.input(screen.getByPlaceholderText(/Buy milk tomorrow/), {
				target: { value: 'Buy milk' }
			});
			await fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
			await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
			expect(bodies()[0].category).toBe('Work');
			// Reset after a successful add, like the due date.
			expect(input.value).toBe('');
		});

		it('sends no category when none is set', async () => {
			render(AddTaskCard, { props: props({ categories: ['Work'] }) });
			await fireEvent.input(screen.getByPlaceholderText(/Buy milk tomorrow/), {
				target: { value: 'Buy milk' }
			});
			await fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
			await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
			expect('category' in bodies()[0]).toBe(false);
		});

		it('applies the category to every task of a bulk add', async () => {
			render(AddTaskCard, { props: props() });
			await fireEvent.click(screen.getByRole('button', { name: 'More' }));
			await fireEvent.input(screen.getByLabelText('Category'), { target: { value: 'Home' } });
			await fireEvent.input(screen.getByPlaceholderText(/Buy milk tomorrow/), {
				target: { value: 'Buy milk\nWalk dog' }
			});
			await fireEvent.click(screen.getByRole('button', { name: /^Add 2$/ }));
			await fireEvent.click(screen.getByRole('button', { name: /^Confirm 2$/ }));
			await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2));
			expect(bodies().map((b) => b.category)).toEqual(['Home', 'Home']);
		});
	});
});
