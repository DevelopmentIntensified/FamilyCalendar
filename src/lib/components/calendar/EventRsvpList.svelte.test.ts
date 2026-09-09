import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import EventRsvpList from './EventRsvpList.svelte';

const rows = [
	{ userId: 'u1', status: 'going', firstName: 'Ana' },
	{ userId: 'u2', status: 'maybe', firstName: null },
	{ userId: 'u3', status: 'declined', firstName: 'Bo' }
];

describe('EventRsvpList', () => {
	afterEach(cleanup);

	it('groups by status with counts, falling back to userId', () => {
		render(EventRsvpList, { props: { rsvpData: rows } });
		expect(screen.getByText('Going (1):')).toBeTruthy();
		expect(screen.getByText('Ana')).toBeTruthy();
		expect(screen.getByText('Maybe (1):')).toBeTruthy();
		expect(screen.getByText('u2')).toBeTruthy();
		expect(screen.getByText('Not Going (1):')).toBeTruthy();
		expect(screen.getByText('Bo')).toBeTruthy();
	});

	it('renders nothing without rows', () => {
		render(EventRsvpList, { props: { rsvpData: [] } });
		expect(screen.queryByText('RSVP Status')).toBeNull();
	});
});
