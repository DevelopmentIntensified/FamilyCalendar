import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import { createEventForm } from './EventFormModel.svelte';
import EventDateTimeFields from './EventDateTimeFields.svelte';

function form() {
	return createEventForm({
		calendars: [{ id: 'cal1', name: 'My Calendar' }],
		familyMembers: [],
		defaultCalendarId: 'cal1',
		initialEvent: undefined
	});
}

describe('EventDateTimeFields', () => {
	afterEach(cleanup);

	it('toggles all-day on the shared form', async () => {
		const f = form();
		render(EventDateTimeFields, { props: { form: f, editScope: 'this' } });
		expect(f.allDay).toBe(false);
		await fireEvent.click(screen.getByText('All day'));
		expect(f.allDay).toBe(true);
	});

	it('binds start date and flags end-before-start', async () => {
		const f = form();
		f.date = '2026-09-10';
		f.endDate = '2026-09-09';
		f.multiDay = true;
		render(EventDateTimeFields, { props: { form: f, editScope: 'this' } });
		expect(screen.getByText("End date can't be before start date")).toBeTruthy();
		// SAFETY: the Start Date field is an <input type=date> in EventDateTimeFields.
		const input = screen.getByLabelText(/Start Date/) as HTMLInputElement;
		await fireEvent.input(input, { target: { value: '2026-09-11' } });
		expect(f.date).toBe('2026-09-11');
	});
});
