import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import EditTaskDialog from './EditTaskDialog.svelte';

const task = {
	id: 't1',
	title: 'Buy milk',
	notes: 'oat',
	tags: ['groceries'],
	dueDate: '2026-09-10T23:59:00.000Z',
	recurrenceFrequency: null,
	recurrenceInterval: null,
	assignedTo: null,
	priority: 'normal',
	visibility: 'public',
	userId: 'u1'
};

function props(overrides = {}) {
	return {
		task: { ...task },
		currentUserId: 'u1',
		familyRoster: [],
		saving: false,
		onSave: vi.fn(),
		onClose: vi.fn(),
		...overrides
	};
}

describe('EditTaskDialog', () => {
	afterEach(cleanup);

	it('prefills from the task and saves the draft on submit', async () => {
		const p = props();
		render(EditTaskDialog, { props: p });
		// SAFETY: the Title field is an <input> in EditTaskDialog.
		expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe('Buy milk');
		await fireEvent.input(screen.getByLabelText(/Title/), { target: { value: 'Buy oat milk' } });
		await fireEvent.click(screen.getByText('Save'));
		expect(p.onSave).toHaveBeenCalledOnce();
		expect(p.onSave.mock.calls[0][0]).toMatchObject({ title: 'Buy oat milk' });
	});

	it('disables save while saving or with a blank title', async () => {
		const saving = props({ saving: true });
		const { unmount } = render(EditTaskDialog, { props: saving });
		// SAFETY: the submit affordance is a <button> in EditTaskDialog.
		expect((screen.getByText('Saving…').closest('button') as HTMLButtonElement).disabled).toBe(
			true
		);
		unmount();

		const blank = props({ task: { ...task, title: 'x' } });
		render(EditTaskDialog, { props: blank });
		await fireEvent.input(screen.getByLabelText(/Title/), { target: { value: '   ' } });
		// SAFETY: Save renders inside a <button> in EditTaskDialog.
		expect((screen.getByText('Save').closest('button') as HTMLButtonElement).disabled).toBe(true);
	});

	it('shows visibility only to the owner', () => {
		const owner = props();
		const { unmount } = render(EditTaskDialog, { props: owner });
		expect(screen.queryByLabelText(/Who can see this/)).toBeTruthy();
		unmount();

		const stranger = props({ currentUserId: 'u9' });
		render(EditTaskDialog, { props: stranger });
		expect(screen.queryByLabelText(/Who can see this/)).toBeNull();
	});

	it('closes on cancel', async () => {
		const p = props();
		render(EditTaskDialog, { props: p });
		await fireEvent.click(screen.getByText('Cancel'));
		expect(p.onClose).toHaveBeenCalledOnce();
	});
});

// Issue 015: the detail modal got `max-h-[80dvh] overflow-y-auto`; this dialog
// did not, so on a landscape phone Save sat below the fold with no way to
// reach it. The card scrolls; the header and the Save row stay put.
describe('EditTaskDialog on a short screen', () => {
	it('caps the card height and gives the body a scroll region', () => {
		render(EditTaskDialog, { props: props() });
		// SAFETY: the dialog card is the [role="dialog"] element in EditTaskDialog.
		const card = screen.getByRole('dialog');
		expect(card.className).toContain('max-h-[90dvh]');
		// SAFETY: the form is a <form> inside EditTaskDialog's card.
		const form = card.querySelector('form') as HTMLElement;
		expect(form.className).toContain('min-h-0');
		expect(form.className).toContain('overflow-y-auto');
		// The Save row rides the scroll body, so it is always reachable.
		expect(screen.getByText('Save').closest('form')).toBe(form);
	});

	describe('category dropdown (#319)', () => {
		it('prefills the task category and offers the viewer list in a dropdown', () => {
			render(EditTaskDialog, {
				props: props({ task: { ...task, category: 'Work' }, categories: ['Errands', 'Work'] })
			});
			// SAFETY: the Category control is a <select> in CategorySelect.
			const select = screen.getByLabelText('Category') as HTMLSelectElement;
			expect(select.value).toBe('Work');
			expect([...select.options].map((o) => o.textContent)).toEqual([
				'No category',
				'Errands',
				'Work',
				'+ Add new…'
			]);
		});

		it('adds a brand-new name through the add-new field', async () => {
			const p = props({ categories: ['Work'] });
			render(EditTaskDialog, { props: p });
			await fireEvent.change(screen.getByLabelText('Category'), {
				target: { value: '__add_new__' }
			});
			await fireEvent.input(screen.getByLabelText('New category name'), {
				target: { value: 'Deep Work' }
			});
			await fireEvent.click(screen.getByText('Save'));
			expect(p.onSave.mock.calls[0][0]).toMatchObject({ category: 'Deep Work' });
		});

		it('clear empties the field so the save payload sends null', async () => {
			const p = props({ task: { ...task, category: 'Work' }, categories: ['Work'] });
			render(EditTaskDialog, { props: p });
			await fireEvent.click(screen.getByRole('button', { name: 'Clear category' }));
			// SAFETY: the Category control is a <select> in CategorySelect.
			expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('');
			await fireEvent.click(screen.getByText('Save'));
			const draft = p.onSave.mock.calls[0][0];
			expect(draft.category).toBe('');
			const { buildEditPayload } = await import('$lib/utils/taskEditPayload');
			const { payload } = buildEditPayload({ ...task, category: 'Work' }, draft, 'u1');
			expect(payload.category).toBeNull();
		});

		it('hides the clear button when empty', () => {
			render(EditTaskDialog, { props: props() });
			expect(screen.queryByRole('button', { name: 'Clear category' })).toBeNull();
		});
	});
});
