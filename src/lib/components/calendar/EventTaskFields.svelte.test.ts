import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import EventTaskFields from './EventTaskFields.svelte';

describe('EventTaskFields', () => {
	afterEach(cleanup);

	it('binds title, visibility, and due date', async () => {
		render(EventTaskFields, {
			props: {
				taskTitle: 'Pay bill',
				taskVisibility: 'public',
				taskDueDate: '',
				taskError: null
			}
		});
		// SAFETY: the Task Title field is an <input> in EventTaskFields.
		const title = screen.getByLabelText(/Task Title/) as HTMLInputElement;
		await fireEvent.input(title, { target: { value: 'Pay water bill' } });
		expect(title.value).toBe('Pay water bill');
		expect(screen.getByLabelText('Visibility')).toBeTruthy();
		expect(screen.getByLabelText('Due Date')).toBeTruthy();
	});

	it('shows the task error when set', () => {
		render(EventTaskFields, {
			props: { taskTitle: '', taskVisibility: 'public', taskDueDate: '', taskError: 'Nope' }
		});
		expect(screen.getByRole('alert').textContent).toBe('Nope');
	});
});
