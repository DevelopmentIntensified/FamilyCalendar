import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import EventGuestNote from './EventGuestNote.svelte';

afterEach(cleanup);

describe('the guest-model note', () => {
	it('says why a guest is marked "not a user"', () => {
		render(EventGuestNote, { props: { guestCount: 2 } });

		expect(screen.getByText('Guests are strings')).toBeInTheDocument();
		expect(screen.getByText('eventAttendance.user_id')).toBeInTheDocument();
		expect(screen.getByTestId('guest-count')).toHaveTextContent(
			'2 people on this event are a guest'
		);
		expect(screen.getByRole('region', { name: 'Guests are strings' })).toHaveTextContent(
			/cannot be assigned a task/
		);
	});

it('does not say "2 people are a guest" when there is one', () => {
		render(EventGuestNote, { props: { guestCount: 1 } });

		expect(screen.getByTestId('guest-count')).toHaveTextContent(
			'1 person on this event is a guest'
		);
	});

it('says so plainly when nobody is a guest', () => {
		render(EventGuestNote, { props: { guestCount: 0 } });

		expect(screen.getByTestId('guest-count')).toHaveTextContent(
			'Nobody on this event is a guest right now.'
		);
	});
});