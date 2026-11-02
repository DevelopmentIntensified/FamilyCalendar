import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import LocationSearch from './LocationSearch.svelte';

interface Pending {
	url: string;
	signal: AbortSignal;
	resolve: (labels: string[]) => void;
}

/** fetch double that honours AbortSignal and lets the test resolve each call. */
function controllableFetch() {
	const calls: Pending[] = [];
	const fn = vi.fn((url: string, init?: { signal?: AbortSignal }) => {
		const signal = init?.signal ?? new AbortController().signal;
		return new Promise<Response>((resolve, reject) => {
			signal.addEventListener('abort', () =>
				reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
			);
			calls.push({
				url,
				signal,
				resolve: (labels) =>
					resolve({
						json: () => Promise.resolve({ results: labels.map((label) => ({ label })) })
					} as Response)
			});
		});
	});
	return { fn, calls };
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

async function type(input: HTMLElement, value: string) {
	await fireEvent.input(input, { target: { value } });
	await vi.advanceTimersByTimeAsync(60);
}

// Issue 263: an aborted request's `finally` nulled the NEWER controller, so the
// next keystroke couldn't abort the in-flight one and stale results won.
describe('LocationSearch request racing', () => {
	it('aborts every superseded request so stale results never overwrite fresh ones', async () => {
		vi.useFakeTimers();
		const { fn, calls } = controllableFetch();
		vi.stubGlobal('fetch', fn);
		render(LocationSearch);
		const input = screen.getByRole('combobox');
		await fireEvent.focus(input);

		await type(input, 'ma'); // call 0
		await type(input, 'mai'); // call 1, aborts 0
		await vi.advanceTimersByTimeAsync(0); // let call 0's rejection settle
		await type(input, 'main'); // call 2, must abort 1
		expect(calls).toHaveLength(3);
		expect(calls[0].signal.aborted).toBe(true);
		expect(calls[1].signal.aborted).toBe(true);

		calls[2].resolve(['Main St (fresh)']);
		await vi.advanceTimersByTimeAsync(0);
		calls[1].resolve(['Maine (stale)']);
		await vi.advanceTimersByTimeAsync(0);

		expect(screen.getByText('Main St (fresh)')).toBeInTheDocument();
		expect(screen.queryByText('Maine (stale)')).not.toBeInTheDocument();
	});
});
