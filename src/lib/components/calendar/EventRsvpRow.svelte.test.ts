import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { toasts } from '$lib/client/toasts';
import EventRsvpRow from './EventRsvpRow.svelte';

function props(overrides = {}) {
	return {
		serverId: 'evt1',
		currentUserRsvpStatus: 'undecided',
		attendees: [],
		nonUserAttendants: [],
		onCurrentUserRsvpStatusChange: vi.fn(),
		onAttendeesChange: vi.fn(),
		onNonUserAttendantsChange: vi.fn(),
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
		const rerenderRef: { rerender?: (props: Record<string, unknown>) => Promise<void> } = {};
		const p = props({
			onCurrentUserRsvpStatusChange: vi.fn((v: string) => {
				rerenderRef.rerender?.({ currentUserRsvpStatus: v });
			})
		});
		const api = render(EventRsvpRow, { props: p });
		rerenderRef.rerender = api.rerender;
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

	// #227: a failed RSVP reverts AND says so.
	it.each([
		['server error', async () => ({ ok: false, status: 500, json: async () => ({}) })],
		[
			'network failure',
			async () => {
				throw new TypeError('Failed to fetch');
			}
		]
	])('on %s reverts and toasts (#227)', async (_label, impl) => {
		toasts.set([]);
		vi.stubGlobal('fetch', vi.fn(impl));
		const p = props({ currentUserRsvpStatus: 'maybe' });
		render(EventRsvpRow, { props: p });
		await fireEvent.click(screen.getByText('Going'));
		await vi.waitFor(() =>
			expect(p.onCurrentUserRsvpStatusChange).toHaveBeenLastCalledWith('maybe')
		);
		expect(get(toasts).map((t) => t.message)).toContain("Couldn't save your RSVP — try again.");
		expect(p.onResponded).not.toHaveBeenCalled();
	});
});
