import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable } from 'svelte/store';
import { DateTime } from 'luxon';
import { invalidateAll } from '$app/navigation';
import WeekView from './WeekView.svelte';

vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(() => Promise.resolve()),
	goto: vi.fn()
}));

const MONDAY = DateTime.fromISO('2026-09-07T12:00:00');

const evt = {
	id: 'e1',
	title: 'Standup',
	date: '2026-09-08',
	start: '2026-09-08T10:00:00',
	end: '2026-09-08T11:00:00',
	allDay: false,
	calendarId: 'cal1'
} as any;

function setup(over: Record<string, any> = {}) {
	const props = {
		currentDate: writable(MONDAY),
		events: [],
		removeEvent: vi.fn(),
		preferedFirstDayOfWeek: 'sunday',
		calendarIds: [{ id: 'cal1', name: 'My Calendar' }],
		openDay: vi.fn(),
		dueTasks: [],
		createAt: vi.fn(),
		selectionMode: false,
		selectedIds: [],
		onToggleSelectionMode: vi.fn(),
		onToggleSelect: vi.fn(),
		...over
	};
	render(WeekView, { props });
	return props;
}

describe('WeekView - slot create and drag move', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
		vi.stubGlobal('confirm', vi.fn(() => true));
		vi.mocked(invalidateAll).mockClear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('starts a new event at the tapped slot, snapped to 15 minutes', async () => {
		const props = setup();
		const cols = screen.getAllByTestId('week-day-column');
		// 60px/hour grid at top 0: clientY 125 -> 125min -> snaps to 120 (02:00).
		await fireEvent.click(cols[0], { clientY: 125 });
		expect(props.createAt).toHaveBeenCalledTimes(1);
		const at = props.createAt.mock.calls[0][0] as DateTime;
		expect(at.hour).toBe(2);
		expect(at.minute).toBe(0);
	});

	it('asks to leave selection mode when a drag starts there', async () => {
		const props = setup({ events: [evt], selectionMode: true });
		await fireEvent.dragStart(screen.getByText('Standup'));
		expect(vi.mocked(confirm)).toHaveBeenCalledTimes(1);
		expect(props.onToggleSelectionMode).toHaveBeenCalledWith(false);
		// No modal opened for the tap-turned-drag.
		expect(props.onToggleSelect).not.toHaveBeenCalled();
	});

	it('toggles selection on chip tap while in selection mode', async () => {
		const props = setup({ events: [evt], selectionMode: true, selectedIds: [] });
		await fireEvent.click(screen.getByText('Standup'));
		expect(props.onToggleSelect).toHaveBeenCalledWith(evt);
	});

	it('does not start create on empty-grid taps while in selection mode', async () => {
		const props = setup({ selectionMode: true });
		const cols = screen.getAllByTestId('week-day-column');
		await fireEvent.click(cols[0], { clientY: 125 });
		expect(props.createAt).not.toHaveBeenCalled();
	});

	it('marks selected chips with a ring and checkbox in selection mode', async () => {
		setup({ events: [evt], selectionMode: true, selectedIds: ['e1'] });
		const chip = screen.getByText('Standup').closest('button');
		expect(chip).not.toBeNull();
		expect(chip).toHaveClass('ring-2');
		expect(chip!.querySelector('svg')).not.toBeNull();
	});

	it('moves a dropped event with a PUT preserving duration', async () => {
		setup({ events: [evt] });
		const cols = screen.getAllByTestId('week-day-column');
		// Realistic flow: dragstart stashes the id, drop reads it.
		await fireEvent.dragStart(screen.getByText('Standup'));
		// Column 0 of the Sep-7 week is Monday Sep 7; drop at 02:00.
		// (MouseEvent carries clientY reliably through jsdom; DragEvent init drops it.)
		await fireEvent(cols[0], new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: 120 }));
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0] as any[];
		expect(url).toBe('/api/events/e1');
		expect(init.method).toBe('PUT');
		const body = JSON.parse(init.body);
		expect(body.start).toContain('2026-09-07T02:00');
		expect(body.end).toContain('2026-09-07T03:00');
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
});
