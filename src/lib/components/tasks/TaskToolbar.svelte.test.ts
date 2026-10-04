import { render, screen, fireEvent, cleanup, within } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import TaskToolbar from './TaskToolbar.svelte';

function props(overrides = {}) {
	return {
		chip: 'all',
		searchQuery: '',
		sortBy: 'due',
		tagFilter: '',
		view: 'open',
		matchCount: 0,
		totalCount: 0,
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

	it('clears the tag filter via its button', async () => {
		const p = props({ tagFilter: 'gro' });
		render(TaskToolbar, { props: p });
		await fireEvent.click(screen.getByLabelText('Clear tag filter'));
		// SAFETY: labelled field is an <input> in TaskToolbar.
		expect((screen.getByLabelText('Filter tasks by tag') as HTMLInputElement).value).toBe('');
	});

	it('gives the search field the platform clear affordance rather than a button of its own', async () => {
		// `tasks.html` chose `type="search"` for a stated reason: at 115px — the
		// 320px case — a bespoke clear button would cost a fifth of the field, and
		// the native ✕ is the one people already know. The pin used to be the
		// button's label; it is now the field's type, which is the same promise.
		const p = props({ searchQuery: 'milk' });
		render(TaskToolbar, { props: p });
		const field = screen.getByLabelText('Search tasks');
		expect(field).toHaveAttribute('type', 'search');
		expect(screen.queryByLabelText('Clear search')).toBeNull();
		// The field still filters as you type.
		await fireEvent.input(field, { target: { value: 'bins' } });
		// SAFETY: labelled field is an <input> in TaskToolbar.
		expect((screen.getByLabelText('Search tasks') as HTMLInputElement).value).toBe('bins');
		expect(p.searchQuery).toBeDefined();
	});
});

/**
 * `tasks.html`, approved. The review mark that produced it was "add small
 * search on this line", and the page it was approved as puts the chips, the
 * search and the sort on ONE filter line under one live title. The app had
 * three rows: chips, then a full-width field, then the tag filter — which is
 * what an owner approving the page asked to change.
 *
 * The chip VOCABULARY is the approved one too. Its third bucket was labelled
 * "Assigned to me" while its own predicate was "assigned to somebody else",
 * which is a control that lies; the structure is kept and the label is made
 * true (`Unassigned`). 019's scope chips are capability the prototype cannot
 * show, so they stay — on the same line, after a divider, with `All` renamed
 * so it cannot be read as the time jump bar's `All`.
 */
describe('TaskToolbar — the approved filter line (tasks.html)', () => {
	afterEach(cleanup);

	it('puts the chips, the search and the sort on ONE line', () => {
		render(TaskToolbar, { props: props() });
		const line = screen.getByTestId('task-filter-line');
		// The thing the mark asked for: not a chip row with a field under it.
		expect(within(line).getByRole('searchbox')).toBeTruthy();
		expect(within(line).getByLabelText('Sort tasks')).toBeTruthy();
		expect(within(line).getByRole('group', { name: 'Filter tasks by owner' })).toBeTruthy();
		// …and it wraps rather than overflowing a 320px phone.
		expect(line.className).toMatch(/flex-wrap/);
	});

	it('carries the approved chips, in the approved order', () => {
		render(TaskToolbar, { props: props() });
		const group = screen.getByRole('group', { name: 'Filter tasks by owner' });
		expect([...group.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual([
			'Open',
			'Mine',
			'Unassigned',
			'Done'
		]);
	});

	it('is single-select over the owner axis, and defaults to Open', async () => {
		const p = props();
		render(TaskToolbar, { props: p });
		const group = screen.getByRole('group', { name: 'Filter tasks by owner' });
		const [open, mine] = [...group.querySelectorAll('button')];
		expect(open?.getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(mine!);
		// One axis, one value: pressing the second releases the first.
		expect(mine?.getAttribute('aria-pressed')).toBe('true');
		expect(open?.getAttribute('aria-pressed')).toBe('false');
	});

	it('keeps 019\'s scope chips, on the same line and out of a name collision', () => {
		render(TaskToolbar, { props: props() });
		const line = screen.getByTestId('task-filter-line');
		const scope = within(line).getByRole('group', { name: 'Filter tasks by scope' });
		expect([...scope.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual([
			'Every scope',
			'Public',
			'Private',
			'Family'
		]);
		// "Every scope", not "All": the time jump bar below already owns "All".
		expect(within(line).queryByRole('button', { name: 'All' })).toBeNull();
	});

	it('titles the line with the count, and says what a query kept', async () => {
		const { container, rerender } = render(
			TaskToolbar,
			{ props: props({ matchCount: 12, totalCount: 12 }) }
		);
		expect(within(container).getByTestId('task-filter-count')).toHaveTextContent('12 tasks');
		await rerender({ matchCount: 3, totalCount: 12, searchQuery: 'bins' });
		// Never a control that did nothing: the count moves as you type.
		expect(within(container).getByTestId('task-filter-count')).toHaveTextContent('3 of 12 match');
		expect(within(container).getByTestId('task-filter-count')).toHaveTextContent('bins');
	});

	it('leaves the tag filter on its own row — a prototype has no second axis', () => {
		render(TaskToolbar, { props: props() });
		const line = screen.getByTestId('task-filter-line');
		// Kept, not merged: it is a different axis from anything the page shows.
		expect(line.contains(screen.getByLabelText('Filter tasks by tag'))).toBe(false);
	});
});
