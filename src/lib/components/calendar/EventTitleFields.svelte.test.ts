import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createEventForm } from './EventFormModel.svelte';
import EventTitleFields from './EventTitleFields.svelte';

function form() {
	return createEventForm({
		calendars: [{ id: 'cal1', name: 'My Calendar' }],
		familyMembers: [],
		defaultCalendarId: 'cal1',
		initialEvent: undefined
	});
}

describe('EventTitleFields', () => {
	afterEach(cleanup);

	it('binds the title to the shared form', async () => {
		const f = form();
		render(EventTitleFields, { props: { form: f, showMore: true, onShowMore: vi.fn() } });
		// SAFETY: the Event Title field is an <input> in EventTitleFields.
		const input = screen.getByLabelText(/Event Title/) as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'Dinner' } });
		expect(f.title).toBe('Dinner');
	});

	it('offers Show More in create mode and fires the callback', async () => {
		const f = form();
		const onShowMore = vi.fn();
		render(EventTitleFields, { props: { form: f, showMore: false, onShowMore } });
		await fireEvent.click(screen.getByText('Show More'));
		expect(onShowMore).toHaveBeenCalledOnce();
	});

	it('hides Show More once expanded', () => {
		const f = form();
		render(EventTitleFields, { props: { form: f, showMore: true, onShowMore: vi.fn() } });
		expect(screen.queryByText('Show More')).toBeNull();
	});
});
