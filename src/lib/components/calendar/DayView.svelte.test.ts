import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable } from 'svelte/store';
import { tick } from 'svelte';
import { DateTime } from 'luxon';
import { invalidateAll } from '$app/navigation';
import { stubFetchResponse, dispatchTouchEvent, isStringBody } from '$lib/utils/testDom';
import type { Event } from '$lib/types';
import DayView from './DayView.svelte';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit injects $app/navigation virtually; no DI seam exists.
vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(() => Promise.resolve()),
	goto: vi.fn()
}));

const TUESDAY = DateTime.fromISO('2026-09-08T12:00:00');

// SAFETY: fixture covers the Event fields DayView renders; optional calendar
// metadata defaults are irrelevant to these tests.
const evt = {
	id: 'e1',
	ownerId: 'u1',
	calendarId: 'cal1',
	title: 'Standup',
	date: '2026-09-08',
	start: '2026-09-08T10:00:00',
	end: '2026-09-08T11:00:00',
	description: null,
	location: null,
	allDay: false,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: null,
	created_at: new Date('2026-01-01T00:00:00Z')
} as Event;

type CreateAtMock = ReturnType<typeof vi.fn<(start: DateTime, end?: DateTime) => void>>;

type SetupOverrides = {
	events?: Event[];
	dueTasks?: never[];
	selectionMode?: boolean;
	addMode?: boolean;
	selectedIds?: string[];
	createAt?: CreateAtMock;
	onToggleSelectionMode?: (on: boolean) => void;
	onToggleSelect?: (event: Event) => void;
};

function setup(over: SetupOverrides = {}) {
	// SAFETY: literal supplies every prop DayView requires; missing optional
	// calendar metadata is irrelevant to these tests.
	const props = {
		currentDate: writable(TUESDAY),
		events: [] as Event[],
		calendarIds: [{ id: 'cal1', name: 'My Calendar' }],
		dueTasks: [],
		createAt: vi.fn<(start: DateTime, end?: DateTime) => void>(),
		selectionMode: false,
		addMode: false,
		selectedIds: [] as string[],
		onToggleSelectionMode: vi.fn<(on: boolean) => void>(),
		onToggleSelect: vi.fn<(event: Event) => void>(),
		...over
	};
	render(DayView, { props });
	return props;
}

// jsdom has no Touch constructor: dispatch plain events carrying touches.
function dispatchTouchStart(el: Element, clientY: number) {
	dispatchTouchEvent(el, 'touchstart', [{ identifier: 1, target: el, clientX: 0, clientY }]);
}

function dispatchTouchMove(el: Element, clientY: number) {
	dispatchTouchEvent(el, 'touchmove', [{ identifier: 1, target: el, clientX: 0, clientY }]);
}

function dispatchTouchEnd(el: Element) {
	dispatchTouchEvent(el, 'touchend', []);
}

describe('DayView - slot create and drag move', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
				stubFetchResponse({})
			)
		);
		vi.stubGlobal(
			'confirm',
			vi.fn(() => true)
		);
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
		const at = props.createAt.mock.calls[0]?.[0] ?? DateTime.fromISO('1970-01-01T00:00:00');
		expect(at.hour).toBe(2);
		expect(at.minute).toBe(0);
	});

	it('asks to leave selection mode when a drag starts there', async () => {
		const props = setup({ events: [evt], selectionMode: true });
		await fireEvent.dragStart(screen.getByText('Standup'));
		// No native confirm: an inline banner asks instead.
		expect(vi.mocked(confirm)).not.toHaveBeenCalled();
		await screen.findByRole('alertdialog', { name: 'Exit selection mode' });
		await fireEvent.click(screen.getByRole('button', { name: 'Exit selection' }));
		expect(props.onToggleSelectionMode).toHaveBeenCalledWith(false);
	});

	it('offers an Add event button on an empty day', async () => {
		const props = setup({ events: [] });
		await fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
		expect(props.createAt).toHaveBeenCalledTimes(1);
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
		const call = props.createAt.mock.calls[0] ?? [];
		const [start = DateTime.fromISO('1970-01-01T00:00:00'), end = start] = call;
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

	it('add mode drag-selects a range with no long-press (#047)', async () => {
		const props = setup({ events: [evt], addMode: true });
		const grid = screen.getByTestId('day-grid');
		// 56px/hour: 112 -> 2:00, 224 -> 4:00. No fake timers needed.
		dispatchTouchStart(grid, 112);
		dispatchTouchMove(grid, 224);
		dispatchTouchEnd(grid);
		await tick();
		expect(screen.getByText('2:00 AM – 4:00 AM')).toBeInTheDocument();
		expect(props.createAt).not.toHaveBeenCalled();
	});

	it('moves a dropped event with a PUT preserving duration', async () => {
		setup({ events: [evt] });
		const grid = screen.getByTestId('day-grid');
		await fireEvent.dragStart(screen.getByText('Standup'));
		await fireEvent(
			grid,
			new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: 112 })
		);
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		const call = vi.mocked(fetch).mock.calls[0];
		expect(call?.[0]).toBe('/api/events/e1');
		const method = call?.[1]?.method;
		const rawBody = call?.[1]?.body;
		if (method !== 'PUT' || !isStringBody(rawBody)) {
			throw new Error('expected PUT request with a string body');
		}
		expect(method).toBe('PUT');
		const body = JSON.parse(rawBody);
		expect(body.start).toContain('2026-09-08T02:00');
		expect(body.end).toContain('2026-09-08T03:00');
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
});
