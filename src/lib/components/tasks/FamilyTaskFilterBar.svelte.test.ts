import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import FamilyTaskFilterBar from './FamilyTaskFilterBar.svelte';

afterEach(cleanup);

describe('FamilyTaskFilterBar', () => {
	it('renders search, sort, and tag controls with a combined active note', async () => {
		render(FamilyTaskFilterBar, {
			props: { searchQuery: '', sortBy: 'due', tagFilter: '' }
		});
		await fireEvent.input(screen.getByLabelText('Search tasks'), {
			target: { value: 'mow' }
		});
		expect(screen.getByText(/Searching “mow”/)).toBeInTheDocument();
	});

	it('clears the search via ×', async () => {
		render(FamilyTaskFilterBar, {
			props: { searchQuery: 'mow', sortBy: 'due', tagFilter: '' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
		expect(screen.queryByText(/Searching/)).not.toBeInTheDocument();
	});
});
