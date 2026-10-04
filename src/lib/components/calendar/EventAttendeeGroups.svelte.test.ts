import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach, vi } from 'vitest';
import EventAttendeeGroups from './EventAttendeeGroups.svelte';

/**
 * Issue 126 — the attendance region, built as app-ui/event.html draws it: a
 * count and a proportion in the heading, a stacked going/maybe/pending bar,
 * one row per person with their own status, guests marked as guests, and an
 * invite affordance. The prototype replaced the app's grouped status chips with
 * this list, so the tests below pin the approved shape rather than the old one.
 */
const member = (first: string, last: string, inviteType = 'optional') => ({
	userId: `u-${first}`,
	firstName: first,
	lastName: last,
	inviteType
});

const rows = {
	going: [member('Sarah', 'Hopper'), member('Jon', 'Hopper')],
	maybe: [member('Mia', 'Hopper')],
	notGoing: [],
	undecided: [member('Eli', 'Hopper', 'required')],
	guests: [{ name: 'Ms Okafor', status: 'going' }, { name: 'Nana', status: 'invited' }]
};

const props = { ...rows, onInvite: vi.fn() };

describe('EventAttendeeGroups', () => {
	afterEach(cleanup);

	// The heading carries the proportion the prototype leads with.
	it('leads with how many are going out of how many were asked', () => {
		render(EventAttendeeGroups, { props });
		// 2 going of 6 asked: 4 members + 2 guests. Everyone was asked.
		expect(screen.getByTestId('attendance-heading')).toHaveTextContent('2/6 going');
	});

	// The bar is the proportion made visible; each segment is one status class.
	it('draws a going/maybe/pending bar sized by the split', () => {
		render(EventAttendeeGroups, { props });
		const bar = screen.getByTestId('attendance-bar');
		const segments = bar.querySelectorAll('[data-segment]');
		expect(segments).toHaveLength(3);
		// 2/6 going, 1/6 maybe, 3/6 not yet answered.
		expect(segments[0].getAttribute('data-segment')).toBe('going');
		expect(segments[0].getAttribute('style')).toContain('width: 33%');
		expect(segments[1].getAttribute('data-segment')).toBe('maybe');
		expect(segments[1].getAttribute('style')).toContain('width: 17%');
		expect(segments[2].getAttribute('data-segment')).toBe('pending');
		expect(segments[2].getAttribute('style')).toContain('width: 50%');
	});

	// One row per person, each carrying its own status — the prototype's list.
	it('lists every person with their own status, not grouped chips', () => {
		render(EventAttendeeGroups, { props });
		const names = screen
			.getAllByTestId('attendance-row')
			.map((row) => row.getAttribute('data-name'));
		expect(names).toEqual(['Sarah Hopper', 'Jon Hopper', 'Mia Hopper', 'Eli Hopper', 'Ms Okafor', 'Nana']);
	});

	it('names each status in words on the row', () => {
		render(EventAttendeeGroups, { props });
		const row = (name: string) =>
			screen.getAllByTestId('attendance-row').find((r) => r.getAttribute('data-name') === name)!;

		expect(row('Sarah Hopper')).toHaveTextContent('Going');
		expect(row('Mia Hopper')).toHaveTextContent('Maybe');
		expect(row('Eli Hopper')).toHaveTextContent('No answer');
		expect(row('Ms Okafor')).toHaveTextContent('Going');
		expect(row('Nana')).toHaveTextContent('Not yet answered');
	});

	it('says "Can\'t go" for a decline, both spellings the column allows', () => {
		render(EventAttendeeGroups, {
			props: {
				...rows,
				notGoing: [{ userId: 'u-declined', firstName: 'Dana', lastName: 'Hopper', status: 'declined' }]
			}
		});
		const row = screen
			.getAllByTestId('attendance-row')
			.find((r) => r.getAttribute('data-name') === 'Dana Hopper')!;
		expect(row).toHaveTextContent('Can\u2019t go');
	});

	// A row handed over without its own status still reads correctly, because the
	// bucket it arrived in says the same thing.
	it('reads the status off the bucket when the row carries none', () => {
		render(EventAttendeeGroups, {
			props: { ...rows, notGoing: [{ userId: 'u-d', firstName: 'Dana', lastName: 'Hopper' }] }
		});
		const row = screen
			.getAllByTestId('attendance-row')
			.find((r) => r.getAttribute('data-name') === 'Dana Hopper')!;
		expect(row).toHaveTextContent('Can\u2019t go');
	});

	// Guests are strings with no account behind them. The prototype says so on
	// the row; the app's grouped chips never did.
	it('marks a guest as a guest so the count does not imply a family member', () => {
		render(EventAttendeeGroups, { props });
		const guest = screen
			.getAllByTestId('attendance-row')
			.find((r) => r.getAttribute('data-name') === 'Ms Okafor')!;
		expect(guest).toHaveTextContent('guest — not a user');
	});

	it('does not call a member a guest', () => {
		render(EventAttendeeGroups, { props });
		const sarah = screen
			.getAllByTestId('attendance-row')
			.find((r) => r.getAttribute('data-name') === 'Sarah Hopper')!;
		expect(sarah.textContent).not.toMatch(/not a user/);
	});

	// Real capability the prototype has no picture of: a required invitation.
	it('keeps the required-invitation marker on the row', () => {
		render(EventAttendeeGroups, { props });
		const eli = screen
			.getAllByTestId('attendance-row')
			.find((r) => r.getAttribute('data-name') === 'Eli Hopper')!;
		expect(eli).toHaveTextContent('Required');
	});

	// The invite affordance the prototype puts at the foot of the region.
	it('offers an invite and hands the name back when one is given', async () => {
		const onInvite = vi.fn();
		render(EventAttendeeGroups, { props: { ...rows, onInvite } });

		await fireEvent.click(screen.getByRole('button', { name: '+ Invite' }));
		const input = screen.getByRole('textbox', { name: /name/i });
		await fireEvent.input(input, { target: { value: 'Cousin Jo' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

		expect(onInvite).toHaveBeenCalledWith('Cousin Jo');
	});

	it('will not invite an empty name', async () => {
		const onInvite = vi.fn();
		render(EventAttendeeGroups, { props: { ...rows, onInvite } });
		await fireEvent.click(screen.getByRole('button', { name: '+ Invite' }));

		await fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

		expect(onInvite).not.toHaveBeenCalled();
	});

	it('renders without a bar when nobody has been asked at all', () => {
		render(EventAttendeeGroups, {
			props: { going: [], maybe: [], notGoing: [], undecided: [], guests: [], onInvite: vi.fn() }
		});
		expect(screen.queryByTestId('attendance-bar')).toBeNull();
		expect(screen.getByRole('button', { name: '+ Invite' })).toBeInTheDocument();
	});
});