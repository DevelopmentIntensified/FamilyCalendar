import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import EventRsvpRow from './EventRsvpRow.svelte';

function props(overrides = {}) {
	return {
		serverId: 'evt1',
		currentUserRsvpStatus: 'undecided',
		attendees: [],
		nonUserAttendants: [],
		onResponded: vi.fn(),
		...overrides
	};
}

describe('EventRsvpRow', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({
					attendance: [{ userId: 'u1', status: 'going', firstName: 'Ana' }],
					rsvpStatus: 'going'
				})
			}))
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('posts the choice optimistically and refreshes lists', async () => {
		const p = props();
		render(EventRsvpRow, { props: p });
		await fireEvent.click(screen.getByText('Going'));
		expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
		expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/events/evt1/rsvp');
		expect(p.onResponded).toHaveBeenCalledWith('going');
		await screen.findByText('tap again to clear');
	});

	it('shows the pressed state for the current choice', () => {
		const p = props({ currentUserRsvpStatus: 'maybe' });
		render(EventRsvpRow, { props: p });
		expect(screen.getByText('Maybe').closest('button')?.getAttribute('aria-pressed')).toBe('true');
	});
});
