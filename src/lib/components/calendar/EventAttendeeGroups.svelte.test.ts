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

/**
 * Issue 126, verifying the modal against app-ui/event.html. The prototype
 * leads the attendance block with a count and a proportion — how many are
 * going out of how many were asked — rather than only the per-status totals the
 * modal showed. Guests are named separately from members, so a count that
 * implied every name was a family member would be wrong.
 */
describe('EventAttendeeGroups — the attendance summary line', () => {
	const mixed = {
		going: [
			{ firstName: 'Ana', lastName: 'A', userId: 'u1', inviteType: 'optional' },
			{ firstName: 'Bo', lastName: 'B', userId: 'u2', inviteType: 'optional' }
		],
		maybe: [{ firstName: 'Cy', lastName: 'C', userId: 'u3', inviteType: 'optional' }],
		notGoing: [],
		undecided: [
			{ firstName: 'Dee', lastName: 'D', userId: 'u4', inviteType: 'optional' },
			{ firstName: 'Eli', lastName: 'E', userId: 'u5', inviteType: 'optional' }
		],
		guests: ['Ms Okafor', 'Nana']
	};

	it('leads with how many are going out of how many were asked', () => {
		render(EventAttendeeGroups, { props: mixed });
		// 2 going, 1 maybe, 2 undecided, 2 guests.
		expect(screen.getByTestId('attendance-summary')).toHaveTextContent('2 of 7 going');
	});

	it('names the split underneath, so the proportion is readable', () => {
		render(EventAttendeeGroups, { props: mixed });
		const summary = screen.getByTestId('attendance-summary');
		expect(summary).toHaveTextContent('1 maybe');
		expect(summary).toHaveTextContent('2 awaiting');
		expect(summary).toHaveTextContent('2 guests');
	});

	it('says nothing at all when there is nobody to be going', () => {
		render(EventAttendeeGroups, {
			props: {
				going: [],
				maybe: [],
				notGoing: [],
				undecided: [],
				guests: []
			}
		});
		expect(screen.queryByText(/of \d+ going/)).toBeNull();
	});

	it('reports an event nobody has answered yet as 0 of N, not as absent', () => {
		render(EventAttendeeGroups, {
			props: { ...mixed, going: [], maybe: [], notGoing: [], guests: [] }
		});
		expect(screen.getByTestId('attendance-summary')).toHaveTextContent('0 of 2 going');
	});
});
