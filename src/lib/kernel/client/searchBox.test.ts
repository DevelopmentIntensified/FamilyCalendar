import { describe, expect, it } from 'vitest';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import { SearchBox } from './searchBox.svelte.js';

interface SearchCall {
	q: string;
	signal: AbortSignal;
	resolve: (rows: string[]) => void;
	reject: (reason: unknown) => void;
}

/** A search whose replies the test sends when it wants to. */
function pendingSearch() {
	const calls: SearchCall[] = [];
	const search = (q: string, signal: AbortSignal) =>
		new Promise<string[]>((resolve, reject) => {
			calls.push({ q, signal, resolve, reject });
		});
	return { search, calls };
}

/** Let the promise chain behind a fired debounce run to completion. */
async function flush() {
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('SearchBox', () => {
	it('waits for the debounce before searching', async () => {
		const scheduler = manualScheduler();
		const { search, calls } = pendingSearch();
		const box = new SearchBox(search, { schedule: scheduler.schedule });

		box.setQuery('ann');

		expect(calls).toHaveLength(0);
		expect(scheduler.tasks[0].ms).toBe(250);

		scheduler.fireAll();
		expect(calls.map((call) => call.q)).toEqual(['ann']);

		calls[0].resolve(['Anna']);
		await flush();

		expect(box.results).toEqual(['Anna']);
		expect(box.pending).toBe(false);
	});

	it('cancels a debounce that a newer query replaced', () => {
		const scheduler = manualScheduler();
		const { search, calls } = pendingSearch();
		const box = new SearchBox(search, { schedule: scheduler.schedule });

		box.setQuery('ann');
		box.setQuery('anna');
		expect(scheduler.tasks).toHaveLength(2);
		expect(scheduler.tasks[0].cancelled).toBe(true);
		scheduler.fireAll();

		expect(calls.map((call) => call.q)).toEqual(['anna']);
	});

	it('aborts the older request when a newer query arrives', async () => {
		const scheduler = manualScheduler();
		const { search, calls } = pendingSearch();
		const box = new SearchBox(search, { schedule: scheduler.schedule });

		box.setQuery('ann');
		scheduler.fireAll();
		const first = calls[0];
		box.setQuery('anna');
		scheduler.fireAll();

		expect(first.signal.aborted).toBe(true);
		expect(calls.map((call) => call.q)).toEqual(['ann', 'anna']);
	});

	it('never lets a late reply for an old query replace newer results', async () => {
		const scheduler = manualScheduler();
		const { search, calls } = pendingSearch();
		const box = new SearchBox(search, { schedule: scheduler.schedule });

		box.setQuery('ann');
		scheduler.fireAll();
		box.setQuery('anna');
		scheduler.fireAll();

		calls[1].resolve(['Anna Bell']);
		await flush();
		expect(box.results).toEqual(['Anna Bell']);

		calls[0].resolve(['Anna from the old query']);
		await flush();
		expect(box.results).toEqual(['Anna Bell']);
	});

	it('clears results below the minimum length without searching', () => {
		const scheduler = manualScheduler();
		const { search, calls } = pendingSearch();
		const box = new SearchBox(search, { schedule: scheduler.schedule });
		box.results = ['stale'];
		box.searchedFor = 'stale';

		box.setQuery('a');

		expect(box.results).toEqual([]);
		expect(box.searchedFor).toBe('');
		expect(box.pending).toBe(false);
		expect(scheduler.tasks).toHaveLength(0);
		expect(calls).toHaveLength(0);

		// Padding is not length: " a " is still one character of query.
		box.setQuery(' a ');
		expect(scheduler.tasks).toHaveLength(0);
		expect(calls).toHaveLength(0);
	});

	it('defaults to a 250 ms debounce and two characters', () => {
		const scheduler = manualScheduler();
		const { search, calls } = pendingSearch();
		const box = new SearchBox(search, { schedule: scheduler.schedule });

		box.setQuery('a');
		expect(calls).toHaveLength(0);
		expect(scheduler.tasks).toHaveLength(0);

		box.setQuery('ab');
		expect(scheduler.tasks[0].ms).toBe(250);
	});

	it('clear resets the box and drops an answer still in flight', async () => {
		const scheduler = manualScheduler();
		const { search, calls } = pendingSearch();
		const box = new SearchBox(search, { schedule: scheduler.schedule });

		box.setQuery('ann');
		scheduler.fireAll();
		box.clear();

		expect(box.query).toBe('');
		expect(box.results).toEqual([]);
		expect(box.failed).toBe(false);
		expect(box.searchedFor).toBe('');
		expect(box.pending).toBe(false);
		expect(calls[0].signal.aborted).toBe(true);

		calls[0].resolve(['Anna']);
		await flush();
		expect(box.results).toEqual([]);
	});

	it('a failed search sets failed and keeps no stale results', async () => {
		const scheduler = manualScheduler();
		const { search, calls } = pendingSearch();
		const box = new SearchBox(search, { schedule: scheduler.schedule });
		box.results = ['stale'];

		box.setQuery('ann');
		scheduler.fireAll();
		calls[0].reject(new Error('offline'));
		await flush();

		expect(box.failed).toBe(true);
		expect(box.results).toEqual([]);
		expect(box.searchedFor).toBe('ann');
		expect(box.pending).toBe(false);
	});

	it('the next query clears a failure', async () => {
		const scheduler = manualScheduler();
		const { search, calls } = pendingSearch();
		const box = new SearchBox(search, { schedule: scheduler.schedule });

		box.setQuery('ann');
		scheduler.fireAll();
		calls[0].reject(new Error('offline'));
		await flush();
		expect(box.failed).toBe(true);

		box.setQuery('anna');
		expect(box.failed).toBe(false);
		expect(box.searchedFor).toBe('ann');

		scheduler.fireAll();
		calls[1].resolve([]);
		await flush();
		expect(box.failed).toBe(false);
	});

	it('searchedFor tracks the query the current results belong to', async () => {
		const scheduler = manualScheduler();
		const { search, calls } = pendingSearch();
		const box = new SearchBox(search, { schedule: scheduler.schedule });

		box.setQuery('  ann  ');
		expect(box.searchedFor).toBe('');
		scheduler.fireAll();
		expect(calls[0].q).toBe('ann');

		calls[0].resolve(['Anna']);
		await flush();
		expect(box.searchedFor).toBe('ann');

		// Old results still belong to "ann" until the new answer arrives.
		box.setQuery('anna');
		expect(box.searchedFor).toBe('ann');
		scheduler.fireAll();
		calls[1].resolve(['Anna Bell']);
		await flush();
		expect(box.searchedFor).toBe('anna');
	});

	it('whitespace-only input never searches', () => {
		const scheduler = manualScheduler();
		const { search, calls } = pendingSearch();
		const box = new SearchBox(search, { schedule: scheduler.schedule });

		box.setQuery('   ');

		expect(box.results).toEqual([]);
		expect(box.searchedFor).toBe('');
		expect(box.failed).toBe(false);
		expect(box.pending).toBe(false);
		expect(scheduler.tasks).toHaveLength(0);
		expect(calls).toHaveLength(0);
	});
});
