import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import { createEventForm } from './EventFormModel.svelte';
import EventMetaFields from './EventMetaFields.svelte';

function form() {
	return createEventForm({
		calendars: [
			{ id: 'cal1', name: 'Mine' },
			{ id: 'cal2', name: 'Family' }
		],
		familyMembers: [],
		defaultCalendarId: 'cal1',
		initialEvent: undefined
	});
}

function props(overrides = {}) {
	return {
		form: form(),
		familyMembers: [],
		calendarIds: [
			{ id: 'cal1', name: 'Mine' },
			{ id: 'cal2', name: 'Family' }
		],
		showMore: true,
		showAttendees: true,
		...overrides
	};
}

describe('EventMetaFields', () => {
	afterEach(cleanup);

	it('binds the location search to the shared form', async () => {
		const p = props();
		render(EventMetaFields, { props: p });
		// SAFETY: the location field renders LocationSearch's text <input>.
		const input = screen.getByPlaceholderText(/Where\?/) as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'Park' } });
		expect(p.form.location).toBe('Park');
	});

	it('opens the calendar picker and selects', async () => {
		const p = props();
		render(EventMetaFields, { props: p });
		await fireEvent.click(screen.getAllByText('Mine')[0]);
		await fireEvent.click(screen.getByText('Family'));
		expect(p.form.selectedCalendarId).toBe('cal2');
	});

	it('#274: shows an invited member by name, not uid, when no roster is passed', () => {
		const f = createEventForm({
			calendars: [{ id: 'cal1', name: 'Mine' }],
			familyMembers: [],
			defaultCalendarId: 'cal1',
			initialEvent: {
				id: 'e1',
				title: 'Yoga',
				description: '',
				location: '',
				calendarId: 'cal1',
				start: '2026-07-17T10:00:00Z',
				allDay: false
			}
		});
		f.prefillInvites([
			{ userId: 'user-abc123', firstName: 'Alice', lastName: 'Smith', inviteType: 'optional' }
		]);
		render(EventMetaFields, { props: props({ form: f }) });
		expect(screen.getByText('Alice Smith')).toBeInTheDocument();
		expect(screen.queryByText('user-abc123')).not.toBeInTheDocument();
	});
});
