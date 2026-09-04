import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable } from 'svelte/store';
import { DateTime } from 'luxon';
import { invalidateAll } from '$app/navigation';
import DayView from './DayView.svelte';

vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(() => Promise.resolve()),
	goto: vi.fn()
}));

const TUESDAY = DateTime.fromISO('2026-09-08T12:00:00');

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
		currentDate: writable(TUESDAY),
		events: [],
		calendarIds: [{ id: 'cal1', name: 'My Calendar' }],
		dueTasks: [],
		createAt: vi.fn(),
		selectionMode: false,
		selectedIds: [],
		onToggleSelectionMode: vi.fn(),
		onToggleSelect: vi.fn(),
		...over
	};
	render(DayView, { props });
	return props;
}

// jsdom has no Touch constructor: dispatch plain events carrying touches.
function dispatchTouchStart(el: Element, clientY: number) {
	const ev = new Event('touchstart', { bubbles: true, cancelable: true }) as any;
	ev.touches = [{ identifier: 1, target: el, clientX: 0, clientY }];
	el.dispatchEvent(ev);
}

function dispatchTouchEnd(el: Element) {
	const ev = new Event('touchend', { bubbles: true, cancelable: true }) as any;
	ev.touches = [];
	el.dispatchEvent(ev);
}

describe('DayView - slot create and drag move', () => {
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
		const props = setup({ events: [evt] });
		const grid = screen.getByTestId('day-grid');
		// 56px/hour grid at top 0: clientY 112 -> 120min (02:00).
		await fireEvent.click(grid, { clientY: 112 });
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
	});

	it('does not start create on empty-grid taps while in selection mode', async () => {
		const props = setup({ events: [evt], selectionMode: true });
		const grid = screen.getByTestId('day-grid');
		await fireEvent.click(grid, { clientY: 300 });
		expect(props.createAt).not.toHaveBeenCalled();
	});

	it('marks selected chips with a ring and checkbox in selection mode', async () => {
		setup({ events: [evt], selectionMode: true, selectedIds: ['e1'] });
		const chip = screen.getByText('Standup').closest('button');
		expect(chip).not.toBeNull();
		expect(chip).toHaveClass('ring-2');
		expect(chip!.querySelector('svg')).not.toBeNull();
	});

	it('selects a dragged time range and creates it with start and end', async () => {
		const props = setup({ events: [evt] });
		const grid = screen.getByTestId('day-grid');
		// 56px/hour grid at top 0: drag 02:00 → 04:00.
		await fireEvent.mouseDown(grid, { button: 0, clientY: 112 });
		await fireEvent.mouseMove(grid, { clientY: 224 });
		await fireEvent.mouseUp(grid);
		expect(screen.getByText('2:00 AM – 4:00 AM')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Create event for selected time' }));
		expect(props.createAt).toHaveBeenCalledTimes(1);
		const [start, end] = props.createAt.mock.calls[0] as DateTime[];
		expect(start.hour).toBe(2);
		expect(end.hour).toBe(4);
	});

	it('long-press selects a default one-hour block', async () => {
		vi.useFakeTimers();
		try {
			const props = setup({ events: [evt] });
			const grid = screen.getByTestId('day-grid');
			dispatchTouchStart(grid, 112);
			await vi.advanceTimersByTimeAsync(500);
			dispatchTouchEnd(grid);
			expect(screen.getByText('2:00 AM – 3:00 AM')).toBeInTheDocument();
			expect(props.createAt).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it('moves a dropped event with a PUT preserving duration', async () => {
		setup({ events: [evt] });
		const grid = screen.getByTestId('day-grid');
		await fireEvent.dragStart(screen.getByText('Standup'));
		await fireEvent(grid, new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: 112 }));
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0] as any[];
		expect(url).toBe('/api/events/e1');
		expect(init.method).toBe('PUT');
		const body = JSON.parse(init.body);
		expect(body.start).toContain('2026-09-08T02:00');
		expect(body.end).toContain('2026-09-08T03:00');
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
});
