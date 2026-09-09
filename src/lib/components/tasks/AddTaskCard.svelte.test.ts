import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
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
		const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body as string);
		expect(body.title).toBe('Buy milk');
		expect(invalidateAll).toHaveBeenCalledOnce();
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
		expect(invalidateAll).toHaveBeenCalledOnce();
	});
});
