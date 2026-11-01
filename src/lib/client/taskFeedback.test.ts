import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// oxlint-disable-next-line anti-slop/no-module-mocking -- $app/navigation is a SvelteKit runtime module with no test seam.
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));

import { undoTaskWithFeedback } from './taskFeedback';
import { toasts } from './toasts';

function lastToast() {
	return get(toasts).at(-1)?.message ?? '';
}

describe('undoTaskWithFeedback (238)', () => {
	beforeEach(() => {
		toasts.set([]);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('confirms the undo on success', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: true }))
		);
		expect(await undoTaskWithFeedback('t1', '2026-11-01')).toBe(true);
		expect(lastToast()).toMatch(/Undone/);
	});

	it('tells the user when the server refuses the undo', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: false, status: 409 }))
		);
		expect(await undoTaskWithFeedback('t1', '2026-11-01')).toBe(false);
		expect(lastToast()).toMatch(/Couldn.t undo/);
	});

	it('tells the user when the network fails instead of throwing', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);
		expect(await undoTaskWithFeedback('t1', null)).toBe(false);
		expect(lastToast()).toMatch(/Couldn.t undo/);
	});
});
