import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import TaskTagFilter from './TaskTagFilter.svelte';

afterEach(cleanup);

describe('TaskTagFilter', () => {
	it('shows the active-filter note while typing', async () => {
		const state = { tagFilter: '' };
		const wired = () => ({
			tagFilter: state.tagFilter,
			onTagFilterChange: (v: string) => (state.tagFilter = v)
		});
		const { rerender } = render(TaskTagFilter, { props: wired() });
		await fireEvent.input(screen.getByLabelText('Filter tasks by tag'), {
			target: { value: 'yard' }
		});
		await rerender({ props: wired() });
		expect(screen.getByText('#yard')).toBeInTheDocument();
	});

	it('clears via the × button', async () => {
		const state = { tagFilter: 'yard' };
		const wired = () => ({
			tagFilter: state.tagFilter,
			onTagFilterChange: (v: string) => (state.tagFilter = v)
		});
		const { rerender } = render(TaskTagFilter, { props: wired() });
		expect(screen.getByRole('button', { name: 'Clear tag filter' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Clear tag filter' }));
		await rerender({ props: wired() });
		expect(screen.queryByRole('button', { name: 'Clear tag filter' })).not.toBeInTheDocument();
	});
});
