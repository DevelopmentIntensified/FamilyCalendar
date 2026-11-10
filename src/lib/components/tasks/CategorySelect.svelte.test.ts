import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CategorySelect from './CategorySelect.svelte';

function props(overrides = {}) {
	return {
		id: 'test-category',
		value: '',
		categories: ['Errands', 'Work'],
		onChange: vi.fn(),
		...overrides
	};
}

const optionTexts = (select: HTMLSelectElement) => [...select.options].map((o) => o.textContent);

describe('CategorySelect', () => {
	afterEach(cleanup);

	it('lists the viewer categories plus no-category and add-new', () => {
		render(CategorySelect, { props: props() });
		// SAFETY: the Category control is a <select> in CategorySelect.
		const select = screen.getByLabelText('Category') as HTMLSelectElement;
		expect(optionTexts(select)).toEqual(['No category', 'Errands', 'Work', '+ Add new…']);
	});

	it('emits the chosen existing name and clears to empty', async () => {
		const p = props({ value: 'Work' });
		render(CategorySelect, { props: p });
		const select = screen.getByLabelText('Category');

		await fireEvent.change(select, { target: { value: 'Errands' } });
		expect(p.onChange).toHaveBeenLastCalledWith('Errands');

		await fireEvent.click(screen.getByRole('button', { name: 'Clear category' }));
		expect(p.onChange).toHaveBeenLastCalledWith('');
	});

	it('reveals a text field for a new name and emits what is typed', async () => {
		const p = props();
		const { rerender } = render(CategorySelect, { props: p });
		const select = screen.getByLabelText('Category');

		await fireEvent.change(select, { target: { value: '__add_new__' } });
		const input = screen.getByLabelText('New category name') as HTMLInputElement;
		expect(input.maxLength).toBe(80);
		await fireEvent.input(input, { target: { value: 'Deep Work' } });
		expect(p.onChange).toHaveBeenLastCalledWith('Deep Work');

		// The saved task carries the name; the next load lists it.
		await rerender(props({ value: 'Deep Work', categories: ['Deep Work', 'Work'] }));
		// SAFETY: the Category control is a <select> in CategorySelect.
		const updated = screen.getByLabelText('Category') as HTMLSelectElement;
		expect(updated.value).toBe('Deep Work');
		expect(optionTexts(updated)).toContain('Deep Work');
	});

	it('restores the previous name when add-new is cancelled', async () => {
		const p = props({ value: 'Work' });
		render(CategorySelect, { props: p });

		await fireEvent.change(screen.getByLabelText('Category'), {
			target: { value: '__add_new__' }
		});
		await fireEvent.input(screen.getByLabelText('New category name'), {
			target: { value: 'Deep Work' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(p.onChange).toHaveBeenLastCalledWith('Work');
		expect(screen.queryByLabelText('New category name')).toBeNull();
	});

	it('keeps a task category that is missing from the viewer list selected', () => {
		render(CategorySelect, { props: props({ value: 'Someone else', categories: ['Work'] }) });
		// SAFETY: the Category control is a <select> in CategorySelect.
		const select = screen.getByLabelText('Category') as HTMLSelectElement;
		expect(select.value).toBe('Someone else');
		expect(optionTexts(select)).toContain('Someone else');
	});
});
