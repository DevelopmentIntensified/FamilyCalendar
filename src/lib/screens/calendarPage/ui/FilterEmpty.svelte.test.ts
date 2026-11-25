/**
 * The three filter empty states: each names its own cause, and each makes the
 * way back one tap.
 *
 * Doc: ../README.md#the-reading-filters
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import FilterEmpty from './FilterEmpty.svelte';

afterEach(cleanup);

describe('FilterEmpty', () => {
	it('says every calendar is hidden, names them, and shows all in one tap', async () => {
		const onexit = vi.fn();
		render(FilterEmpty, {
			props: { kind: 'calendars', labels: ['Riveras', 'School'], onexit }
		});

		expect(screen.getByRole('heading', { name: 'Every calendar is hidden' })).toBeTruthy();
		expect(screen.getByText(/Riveras, School are hidden/)).toBeTruthy();
		screen.getByRole('button', { name: 'Show all calendars' }).click();
		expect(onexit).toHaveBeenCalledTimes(1);
	});

	it('quotes what a search missed', () => {
		render(FilterEmpty, {
			props: { kind: 'search', labels: [], query: 'football piano', onexit: () => {} }
		});
		expect(screen.getByRole('heading', { name: 'Nothing matches “football piano”' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy();
	});

	it('names the single switched-off person, and everyone when all are off', () => {
		const { unmount } = render(FilterEmpty, {
			props: { kind: 'people', labels: ['Leo'], onexit: () => {} }
		});
		expect(screen.getByRole('heading', { name: 'Nothing for Leo in this view' })).toBeTruthy();
		unmount();

		render(FilterEmpty, {
			props: { kind: 'people', labels: ['You', 'Leo'], onexit: () => {} }
		});
		expect(screen.getByRole('heading', { name: 'Nothing left in this view' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Show everyone' })).toBeTruthy();
	});
});
