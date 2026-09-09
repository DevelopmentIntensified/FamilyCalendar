import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import TaskToolbar from './TaskToolbar.svelte';

function props(overrides = {}) {
	return {
		chip: 'all',
		searchQuery: '',
		sortBy: 'due',
		tagFilter: '',
		...overrides
	};
}

describe('TaskToolbar', () => {
	afterEach(cleanup);

	it('flips the pressed chip on click', async () => {
		const p = props();
		render(TaskToolbar, { props: p });
		const pub = screen.getByText('Public');
		expect(pub.getAttribute('aria-pressed')).toBe('false');
		await fireEvent.click(pub);
		expect(pub.getAttribute('aria-pressed')).toBe('true');
	});

	it('exposes search, sort, and tag inputs', async () => {
		const p = props();
		render(TaskToolbar, { props: p });
		await fireEvent.input(screen.getByLabelText('Search tasks'), {
			target: { value: 'milk' }
		});
		// SAFETY: labelled field is an <input> in TaskToolbar.
		expect((screen.getByLabelText('Search tasks') as HTMLInputElement).value).toBe('milk');
		await fireEvent.input(screen.getByLabelText('Filter tasks by tag'), {
			target: { value: 'gro' }
		});
		// SAFETY: labelled field is an <input> in TaskToolbar.
		expect((screen.getByLabelText('Filter tasks by tag') as HTMLInputElement).value).toBe('gro');
		expect(screen.getByLabelText('Sort tasks')).toBeTruthy();
	});

	it('clears search and tag via their buttons', async () => {
		const p = props({ searchQuery: 'milk', tagFilter: 'gro' });
		render(TaskToolbar, { props: p });
		await fireEvent.click(screen.getByLabelText('Clear search'));
		// SAFETY: labelled field is an <input> in TaskToolbar.
		expect((screen.getByLabelText('Search tasks') as HTMLInputElement).value).toBe('');
		await fireEvent.click(screen.getByLabelText('Clear tag filter'));
		// SAFETY: labelled field is an <input> in TaskToolbar.
		expect((screen.getByLabelText('Filter tasks by tag') as HTMLInputElement).value).toBe('');
	});
});
