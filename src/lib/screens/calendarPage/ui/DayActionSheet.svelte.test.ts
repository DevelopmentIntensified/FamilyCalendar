/**
 * The narrow-width day sheet: every action closes it AND acts on the day it was
 * opened for. The page feeds `day` from `daySheetDate`, and closing clears that
 * field, so an action that read `day` after `onclose()` saw `null` ("View this
 * day's events" opened nothing).
 *
 * Doc: ../README.md#selection-bulk-edit-and-the-modals
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { DateTime } from 'luxon';
import DayActionSheet from './DayActionSheet.svelte';
import type { CalendarPageState } from '../calendarPage.state.svelte';

afterEach(cleanup);

const SUNDAY = DateTime.fromISO('2026-11-22', { zone: 'UTC' });

/** Only what the sheet reads: an empty day map, the calendars and two openers. */
function fakeState() {
	const openCreate = vi.fn();
	const openDay = vi.fn();
	const state = {
		days: new Map(),
		shell: { calendars: [] },
		zone: 'UTC',
		openCreate,
		openDay
	} as unknown as CalendarPageState;
	return { state, openCreate, openDay };
}

/** Props whose `day` clears the moment the sheet closes, as the page's does. */
function mount() {
	const { state, openCreate, openDay } = fakeState();
	let daySheetDate: DateTime | null = SUNDAY;
	const onviewevents = vi.fn();
	const props = {
		state,
		open: true,
		get day() {
			return daySheetDate as DateTime;
		},
		onclose: () => {
			daySheetDate = null;
		},
		onviewevents
	};
	render(DayActionSheet, { props });
	return { openCreate, openDay, onviewevents };
}

describe('DayActionSheet', () => {
	it("hands the opened day to 'View this day's events' even though closing clears it", () => {
		const { onviewevents } = mount();

		screen.getByText("View this day's events").click();

		expect(onviewevents).toHaveBeenCalledTimes(1);
		expect(onviewevents.mock.calls[0][0].toISODate()).toBe('2026-11-22');
	});

	it.each<{ label: string; opener: 'openCreate' | 'openDay' }>([
		{ label: 'Add event', opener: 'openCreate' },
		{ label: 'Open Day View', opener: 'openDay' }
	])('hands the opened day to $label', ({ label, opener }) => {
		const mounted = mount();

		screen.getByText(label).click();

		expect(mounted[opener].mock.calls[0][0].toISODate()).toBe('2026-11-22');
	});
});
