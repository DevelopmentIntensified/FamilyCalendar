import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable } from 'svelte/store';
import { tick } from 'svelte';
import { DateTime } from 'luxon';
import { invalidateAll } from '$app/navigation';
import { stubFetchResponse, dispatchTouchEvent, isStringBody } from '$lib/utils/testDom';
import type { Event } from '$lib/types';
import WeekView from './WeekView.svelte';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit injects $app/navigation virtually; no DI seam exists.
vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(() => Promise.resolve()),
	goto: vi.fn()
}));

const MONDAY = DateTime.fromISO('2026-09-07T12:00:00');

// SAFETY: fixture covers the Event fields WeekView renders; optional calendar
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
	removeEvent?: (id: string) => void;
	openDay?: (date: DateTime) => void;
	onToggleSelectionMode?: (on: boolean) => void;
	onToggleSelect?: (event: Event) => void;
};

function setup(over: SetupOverrides = {}) {
	// SAFETY: literal supplies every prop WeekView requires; missing optional
	// calendar metadata is irrelevant to these tests.
	const props = {
		currentDate: writable(MONDAY),
		events: [] as Event[],
		removeEvent: vi.fn<(id: string) => void>(),
		preferedFirstDayOfWeek: 'sunday',
		calendarIds: [{ id: 'cal1', name: 'My Calendar' }],
		openDay: vi.fn<(date: DateTime) => void>(),
		dueTasks: [],
		createAt: vi.fn<(start: DateTime, end?: DateTime) => void>(),
		selectionMode: false,
		addMode: false,
		selectedIds: [] as string[],
		onToggleSelectionMode: vi.fn<(on: boolean) => void>(),
		onToggleSelect: vi.fn<(event: Event) => void>(),
		...over
	};
	render(WeekView, { props });
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

describe('WeekView - slot create and drag move', () => {
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
		const props = setup();
		const cols = screen.getAllByTestId('week-day-column');
		// 60px/hour grid at top 0: clientY 125 -> 125min -> snaps to 120 (02:00).
		await fireEvent.click(cols[0], { clientY: 125 });
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

	it('selects a dragged time range and creates it with start and end', async () => {
		const props = setup();
		const cols = screen.getAllByTestId('week-day-column');
		// 60px/hour grid at top 0: drag 02:00 → 04:00.
		await fireEvent.mouseDown(cols[0], { button: 0, clientY: 120 });
		await fireEvent.mouseMove(cols[0], { clientY: 240 });
		await fireEvent.mouseUp(cols[0]);
		expect(screen.getByText('2:00 AM – 4:00 AM')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Create event for selected time' }));
		expect(props.createAt).toHaveBeenCalledTimes(1);
		const call = props.createAt.mock.calls[0] ?? [];
		const [start = DateTime.fromISO('1970-01-01T00:00:00'), end = start] = call;
		expect(start.hour).toBe(2);
		expect(end.hour).toBe(4);
	});

	it('refines the range with steppers before creating', async () => {
		const props = setup();
		const cols = screen.getAllByTestId('week-day-column');
		await fireEvent.mouseDown(cols[0], { button: 0, clientY: 120 });
		await fireEvent.mouseMove(cols[0], { clientY: 240 });
		await fireEvent.mouseUp(cols[0]);
		await fireEvent.click(screen.getByRole('button', { name: 'Extend by 15 minutes' }));
		expect(screen.getByText('2:00 AM – 4:15 AM')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Create event for selected time' }));
		const call = props.createAt.mock.calls[0] ?? [];
		const end = call[1] ?? call[0] ?? DateTime.fromISO('1970-01-01T00:00:00');
		expect(end.hour).toBe(4);
		expect(end.minute).toBe(15);
	});

	it('long-press selects a default one-hour block', async () => {
		vi.useFakeTimers();
		try {
			const props = setup();
			const cols = screen.getAllByTestId('week-day-column');
			dispatchTouchStart(cols[0], 120);
			await vi.advanceTimersByTimeAsync(500);
			dispatchTouchEnd(cols[0]);
			expect(screen.getByText('2:00 AM – 3:00 AM')).toBeInTheDocument();
			expect(props.createAt).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it('add mode drag-selects a range with no long-press (#047)', async () => {
		const props = setup({ addMode: true });
		const cols = screen.getAllByTestId('week-day-column');
		// No fake timers: immediate select on touchstart, extend on move.
		dispatchTouchStart(cols[0], 120);
		dispatchTouchMove(cols[0], 240);
		dispatchTouchEnd(cols[0]);
		await tick();
		expect(screen.getByText('2:00 AM – 4:00 AM')).toBeInTheDocument();
		expect(props.createAt).not.toHaveBeenCalled();
	});

	it('moves a dropped event with a PUT preserving duration', async () => {
		setup({ events: [evt] });
		const cols = screen.getAllByTestId('week-day-column');
		// Realistic flow: dragstart stashes the id, drop reads it.
		await fireEvent.dragStart(screen.getByText('Standup'));
		// Column 0 of the Sep-7 week is Monday Sep 7; drop at 02:00.
		// (MouseEvent carries clientY reliably through jsdom; DragEvent init drops it.)
		await fireEvent(
			cols[0],
			new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: 120 })
		);
		expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		const call = vi.mocked(fetch).mock.calls[0];
		expect(call?.[0]).toBe('/api/events/e1');
		const init = call?.[1];
		const method = init?.method;
		const rawBody = init?.body;
		if (method !== 'PUT' || !isStringBody(rawBody)) {
			throw new Error('expected PUT request with a string body');
		}
		expect(method).toBe('PUT');
		const body = JSON.parse(rawBody);
		expect(body.start).toContain('2026-09-07T02:00');
		expect(body.end).toContain('2026-09-07T03:00');
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
});
