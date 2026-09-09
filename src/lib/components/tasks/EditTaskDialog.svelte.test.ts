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
