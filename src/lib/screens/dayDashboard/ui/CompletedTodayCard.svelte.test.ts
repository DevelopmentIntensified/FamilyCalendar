/**
 * Completed Today / Completed this day: the win count, the times and the two
 * empty copies. Props only.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import CompletedTodayCard from './CompletedTodayCard.svelte';

afterEach(cleanup);

describe('CompletedTodayCard', () => {
	it('says nothing is checked off yet on today', () => {
		render(CompletedTodayCard, { props: { tasks: [], isToday: true } });
		expect(screen.getByRole('heading', { name: 'Completed today' })).toBeTruthy();
		expect(screen.getByText('Nothing checked off yet — your wins will land here.')).toBeTruthy();
	});

	it('uses the past-day copy for a viewed day', () => {
		render(CompletedTodayCard, { props: { tasks: [], isToday: false } });
		expect(screen.getByRole('heading', { name: 'Completed this day' })).toBeTruthy();
		expect(screen.getByText('Nothing was completed this day.')).toBeTruthy();
	});

	it('counts the wins with singular/plural and prints the completion times', () => {
		render(CompletedTodayCard, {
			props: {
				isToday: true,
				tasks: [
					{ id: 'a', title: 'Water plants', completedAt: '2026-11-02T12:00:00.000Z' },
					{ id: 'b', title: 'Practice piano', completedAt: '2026-11-02T07:00:00.000Z' }
				]
			}
		});
		expect(screen.getByText('wins')).toBeTruthy();
		expect(screen.getByText('2')).toBeTruthy();
		expect(screen.getByText('Water plants')).toBeTruthy();
		expect(screen.getByText('12:00 PM')).toBeTruthy();
	});

	it('says "win" for one', () => {
		render(CompletedTodayCard, {
			props: { isToday: true, tasks: [{ id: 'a', title: 'One', completedAt: null }] }
		});
		expect(screen.getByText('win')).toBeTruthy();
	});
});
