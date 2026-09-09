import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import { createEventForm } from './EventFormModel.svelte';
import EventRecurrenceFields from './EventRecurrenceFields.svelte';

function form() {
	return createEventForm({
		calendars: [{ id: 'cal1', name: 'My Calendar' }],
		familyMembers: [],
		defaultCalendarId: 'cal1',
		initialEvent: undefined
	});
}

describe('EventRecurrenceFields', () => {
	afterEach(cleanup);

	it('sets the frequency on the shared form and reveals the interval', async () => {
		const f = form();
		render(EventRecurrenceFields, { props: { form: f, editScope: 'this' } });
		// SAFETY: labelled field is a <select> in EventRecurrenceFields.
		const select = screen.getByLabelText('Repeat') as HTMLSelectElement;
		await fireEvent.change(select, { target: { value: 'weekly' } });
		expect(f.recurrenceFrequency).toBe('weekly');
		expect(screen.getByLabelText('Repeat interval')).toBeTruthy();
	});

	it('binds the reminder select to the form', async () => {
		const f = form();
		render(EventRecurrenceFields, { props: { form: f, editScope: 'this' } });
		// SAFETY: labelled field is a <select> in EventRecurrenceFields.
		const select = screen.getByLabelText('Reminder') as HTMLSelectElement;
		await fireEvent.change(select, { target: { value: '30' } });
		expect(String(f.reminderMinutes)).toBe('30');
	});
});
