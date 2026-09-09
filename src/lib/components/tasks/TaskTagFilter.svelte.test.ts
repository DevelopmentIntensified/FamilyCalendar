import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import TaskTagFilter from './TaskTagFilter.svelte';

afterEach(cleanup);

describe('TaskTagFilter', () => {
	it('shows the active-filter note while typing', async () => {
		render(TaskTagFilter, { props: { tagFilter: '' } });
		await fireEvent.input(screen.getByLabelText('Filter tasks by tag'), {
			target: { value: 'yard' }
		});
		expect(screen.getByText('#yard')).toBeInTheDocument();
	});

	it('clears via the × button', async () => {
		render(TaskTagFilter, { props: { tagFilter: 'yard' } });
		expect(screen.getByRole('button', { name: 'Clear tag filter' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Clear tag filter' }));
		expect(screen.queryByRole('button', { name: 'Clear tag filter' })).not.toBeInTheDocument();
	});
});
