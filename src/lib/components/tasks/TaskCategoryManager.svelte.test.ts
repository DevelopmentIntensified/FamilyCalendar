import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import TaskCategoryManager from './TaskCategoryManager.svelte';
import { pushToast } from '$lib/client/toasts';

// oxlint-disable-next-line anti-slop/no-module-mocking -- toast store is global side-effect state; spying keeps assertions local.
vi.mock('$lib/client/toasts', () => ({ pushToast: vi.fn() }));

const categories = [
	{ id: 'c1', name: 'Errands' },
	{ id: 'c2', name: 'Work' }
];

/** A fetch that resolves only when `release` is called, so the optimistic
 * state can be asserted while the request is in flight. */
function deferredFetch(status: number, body: unknown) {
	let release: () => void = () => {};
	const gate = new Promise<void>((r) => (release = r));
	const fn = vi.fn(async () => {
		await gate;
		return { ok: status < 400, status, json: async () => body };
	});
	vi.stubGlobal('fetch', fn);
	return { fn, release };
}

function names() {
	return screen.getAllByTestId('category-name').map((n) => n.textContent?.trim());
}

async function startRename(from: string, to: string) {
	await fireEvent.click(screen.getByRole('button', { name: `Rename ${from}` }));
	await fireEvent.input(screen.getByLabelText(`New name for ${from}`), { target: { value: to } });
	await fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
}

describe('TaskCategoryManager (#280)', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('lists the categories and says so when empty', () => {
		const { unmount } = render(TaskCategoryManager, { props: { startOpen: true, categories } });
		expect(names()).toEqual(['Errands', 'Work']);
		unmount();
		render(TaskCategoryManager, { props: { startOpen: true, categories: [] } });
		expect(screen.getByText(/No categories yet/)).toBeTruthy();
	});

	it('renames optimistically, PATCHes, toasts and calls onChanged', async () => {
		const { fn, release } = deferredFetch(200, { category: { id: 'c2', name: 'Admin' } });
		const onChanged = vi.fn();
		render(TaskCategoryManager, { props: { startOpen: true, categories, onChanged } });
		await startRename('Work', 'Admin');
		// Optimistic: the new name shows (re-sorted) before the server answers.
		expect(names()).toEqual(['Admin', 'Errands']);
		expect(fn).toHaveBeenCalledWith(
			'/api/task-categories/c2',
			expect.objectContaining({ method: 'PATCH' })
		);
		release();
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
		expect(vi.mocked(pushToast)).toHaveBeenCalledWith(
			expect.objectContaining({ message: expect.stringContaining('Renamed "Work" to "Admin"') })
		);
	});

	it('rolls back a 409 rename and shows the server message', async () => {
		const { release } = deferredFetch(409, { error: 'A category with that name already exists' });
		const onChanged = vi.fn();
		render(TaskCategoryManager, { props: { startOpen: true, categories, onChanged } });
		await startRename('Work', 'errands');
		expect(names()).toContain('errands');
		release();
		await waitFor(() => expect(names()).toEqual(['Errands', 'Work']));
		expect(screen.getByRole('alert').textContent).toContain(
			'A category with that name already exists'
		);
		expect(vi.mocked(pushToast)).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining('A category with that name already exists')
			})
		);
		expect(onChanged).not.toHaveBeenCalled();
	});

	it('blocks a blank rename without a request', async () => {
		const fn = vi.fn();
		vi.stubGlobal('fetch', fn);
		render(TaskCategoryManager, { props: { startOpen: true, categories } });
		await startRename('Work', '   ');
		expect(fn).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').textContent).toContain('Name is required');
	});

	it('deletes after confirm, optimistically, and toasts', async () => {
		const { fn, release } = deferredFetch(200, { success: true });
		const onChanged = vi.fn();
		render(TaskCategoryManager, { props: { startOpen: true, categories, onChanged } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }));
		expect(fn).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Work' }));
		expect(names()).toEqual(['Errands']);
		release();
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
		expect(fn).toHaveBeenCalledWith('/api/task-categories/c2', { method: 'DELETE' });
		expect(vi.mocked(pushToast)).toHaveBeenCalledWith(
			expect.objectContaining({ message: expect.stringContaining('Deleted "Work"') })
		);
	});

	it('rolls back a failed delete', async () => {
		const { release } = deferredFetch(500, { error: 'Server error' });
		render(TaskCategoryManager, { props: { startOpen: true, categories } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Work' }));
		expect(names()).toEqual(['Errands']);
		release();
		await waitFor(() => expect(names()).toEqual(['Errands', 'Work']));
		expect(screen.getByRole('alert').textContent).toContain('Server error');
	});

	it('treats a 404 delete as already gone', async () => {
		const { release } = deferredFetch(404, { error: 'Category not found' });
		const onChanged = vi.fn();
		render(TaskCategoryManager, { props: { startOpen: true, categories, onChanged } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Work' }));
		release();
		await waitFor(() => expect(onChanged).toHaveBeenCalled());
		expect(names()).toEqual(['Errands']);
	});
});

describe('TaskCategoryManager disclosure', () => {
	afterEach(cleanup);

	it('starts collapsed with a count and opens on click', async () => {
		render(TaskCategoryManager, { props: { categories } });
		expect(screen.queryAllByTestId('category-name')).toHaveLength(0);
		const toggle = screen.getByRole('button', { name: /Categories · 2/ });
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(toggle);
		expect(names()).toEqual(['Errands', 'Work']);
	});
});
