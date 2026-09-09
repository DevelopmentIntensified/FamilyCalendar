import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import EventAttendeeGroups from './EventAttendeeGroups.svelte';

const rows = {
	going: [{ firstName: 'Ana', lastName: 'A', userId: 'u1', inviteType: 'required' }],
	maybe: [],
	notGoing: [{ firstName: null, lastName: null, userId: 'u2', inviteType: 'optional' }],
	undecided: [{ firstName: 'Bo', lastName: 'B', userId: 'u3', inviteType: 'required' }],
	guests: ['Cousin Jo']
};

describe('EventAttendeeGroups', () => {
	afterEach(cleanup);

	it('groups by status with counts, initials, and required flags', () => {
		render(EventAttendeeGroups, { props: rows });
		expect(screen.getByText('Going (1)')).toBeTruthy();
		expect(screen.getByText('AA')).toBeTruthy();
		expect(screen.getAllByText('Req').length).toBeGreaterThan(0);
		expect(screen.getByText('Not Going (1)')).toBeTruthy();
		expect(screen.getByText('u2')).toBeTruthy();
		expect(screen.getByText('Awaiting response (1)')).toBeTruthy();
		expect(screen.getByText('Required')).toBeTruthy();
		expect(screen.getByText('Guests (1)')).toBeTruthy();
		expect(screen.getByText('Cousin Jo')).toBeTruthy();
	});

	it('hides empty groups', () => {
		render(EventAttendeeGroups, { props: { ...rows, going: [], guests: [] } });
		expect(screen.queryByText('Going (0)')).toBeNull();
		expect(screen.queryByText(/Guests \(/)).toBeNull();
		expect(screen.getByText('Not Going (1)')).toBeTruthy();
	});
});
