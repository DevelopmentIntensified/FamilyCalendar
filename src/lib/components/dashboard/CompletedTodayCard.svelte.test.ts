import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import CompletedTodayCard from './CompletedTodayCard.svelte';

afterEach(() => {
	cleanup();
});

describe('CompletedTodayCard', () => {
	it('lists completed tasks with their times and a win count', () => {
		render(CompletedTodayCard, {
			props: {
				isToday: true,
				tasks: [
					{ id: 't1', title: 'Math homework', completedAt: '2026-09-02T14:30:00.000Z' },
					{ id: 't2', title: 'Dishes', completedAt: '2026-09-02T18:00:00.000Z' }
				]
			}
		});
		expect(screen.getByText('Math homework')).toBeInTheDocument();
		expect(screen.getByText('Dishes')).toBeInTheDocument();
		expect(screen.getByText('2')).toBeInTheDocument();
		expect(screen.getByText('wins')).toBeInTheDocument();
	});

	it('shows an encouraging empty state for today', () => {
		render(CompletedTodayCard, { props: { isToday: true, tasks: [] } });
		expect(screen.getByText(/Nothing checked off yet/)).toBeInTheDocument();
	});

	it('labels past days differently', () => {
		render(CompletedTodayCard, { props: { isToday: false, tasks: [] } });
		expect(screen.getByText('Completed this day')).toBeInTheDocument();
	});
});
