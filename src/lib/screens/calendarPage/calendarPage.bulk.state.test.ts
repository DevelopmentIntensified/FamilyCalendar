/**
 * The bulk bar's state in node, no DOM: the inline delete confirm (never
 * `window.confirm`), the smart dry run → review → apply, the past-date ask, the
 * verbatim server error and the toasts that name the count. A fake api and
 * `memoryToasts()`, nothing mocked at module level (R9).
 *
 * Doc: ./README.md#selection-bulk-edit-and-the-modals
 */
import { describe, expect, it, vi } from 'vitest';
import type { CalendarApi } from '$lib/domains/calendar/index';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import { CalendarBulkState, type CalendarBulkOp } from './calendarPage.bulk.state.svelte';
import type { CalendarPageCalendar } from './calendarPage.contract';

const CALENDARS: readonly CalendarPageCalendar[] = [
	{ id: 'personal', name: 'Personal Calendar', color: '#fa8072', kind: 'personal' },
	{ id: 'family', name: 'Riveras', color: '#e0ffff', kind: 'family' }
];
const EVENTS = [{ id: 'e1', masterId: null, title: 'Piano' }];
const IDS = ['e1'];

function bulkOf(
	bulkEdit: CalendarApi['bulkEdit'],
	overrides: { report?: () => Promise<boolean>; onapplied?: () => Promise<void> } = {}
) {
	const toasts = memoryToasts();
	const applied = vi.fn(async () => {});
	const state = new CalendarBulkState({
		api: { bulkEdit } as unknown as CalendarApi,
		toasts,
		calendars: CALENDARS,
		events: () => EVENTS,
		todayKey: () => '2026-03-10',
		onapplied: overrides.onapplied ?? applied,
		report: overrides.report
	});
	return { state, toasts, applied };
}

describe('runBulk', () => {
	it('arms the delete confirm instead of deleting directly', async () => {
		const bulkEdit = vi.fn<CalendarApi['bulkEdit']>(async () => ({
			ok: true as const,
			data: { success: true as const, applied: 1 }
		}));
		const { state, toasts, applied } = bulkOf(bulkEdit);

		// Opening the confirm is the bar's job; only Yes, delete runs the op.
		state.confirmDelete = true;
		expect(bulkEdit).not.toHaveBeenCalled();

		await state.runBulk(IDS, { type: 'delete' });
		expect(bulkEdit).toHaveBeenCalledWith({ ids: [{ id: 'e1' }], op: { type: 'delete' } });
		expect(state.confirmDelete).toBe(false);
		expect(toasts.items.map((item) => item.text)).toEqual(['Deleted 1 event.']);
		expect(applied).toHaveBeenCalledTimes(1);
	});

	it('names the calendar a move landed on', async () => {
		const bulkEdit = vi.fn<CalendarApi['bulkEdit']>(async () => ({
			ok: true as const,
			data: { success: true as const, applied: 2 }
		}));
		const { state, toasts } = bulkOf(bulkEdit);
		const op: CalendarBulkOp = { type: 'calendar', calendarId: 'family' };

		await state.runBulk(['e1', 'e2'], op);
		expect(toasts.items.map((item) => item.text)).toEqual(['Moved 2 events to Riveras.']);
	});

	it('shows the server’s error verbatim and does not reload', async () => {
		const bulkEdit = vi.fn<CalendarApi['bulkEdit']>(async () => ({
			ok: false as const,
			status: 403,
			error: 'No editable events matched'
		}));
		const { state, applied } = bulkOf(bulkEdit);

		await state.runBulk(IDS, { type: 'delete' });
		expect(state.error).toBe('No editable events matched');
		expect(applied).not.toHaveBeenCalled();
	});

	it('falls back to the legacy copy when the request itself fails', async () => {
		const bulkEdit = vi.fn<CalendarApi['bulkEdit']>(async () => {
			throw new Error('offline');
		});
		const { state } = bulkOf(bulkEdit);
		await state.runBulk(IDS, { type: 'delete' });
		expect(state.error).toBe("Hmm, that didn't take. Try again.");
	});
});

describe('runSmart', () => {
	const plan = {
		ok: true as const,
		data: { success: true as const, plan: [{ id: 'e1', date: '2026-03-11', startTime: '09:00' }] }
	};

	it('names the count after a bulk apply, through the dry run and the review list', async () => {
		const bulkEdit = vi
			.fn<CalendarApi['bulkEdit']>()
			.mockResolvedValueOnce(plan)
			.mockResolvedValueOnce({ ok: true as const, data: { success: true as const, applied: 1 } });
		const { state, toasts, applied } = bulkOf(bulkEdit);

		state.instruction = 'move all to next wednesday';
		await state.runSmart(IDS);

		expect(bulkEdit).toHaveBeenLastCalledWith({
			ids: [{ id: 'e1' }],
			op: { type: 'smart', instruction: 'move all to next wednesday' },
			dryRun: true,
			plan: undefined
		});
		expect(state.plan?.items).toEqual([
			{ id: 'e1', label: 'Piano: move to Wed, Mar 11, start 09:00' }
		]);

		state.plan && (await state.runSmart(IDS));
		expect(bulkEdit).toHaveBeenLastCalledWith({
			ids: [{ id: 'e1' }],
			op: { type: 'smart', instruction: 'move all to next wednesday' },
			dryRun: false,
			plan: plan.data.plan
		});
		expect(toasts.items.map((item) => item.text)).toEqual(['Applied 1 change to your events.']);
		expect(state.plan).toBe(null);
		expect(applied).toHaveBeenCalledTimes(1);
	});

	it('asks before applying a plan that moves events into the past', async () => {
		const pastPlan = {
			ok: true as const,
			data: { success: true as const, plan: [{ id: 'e1', date: '2026-03-04' }] }
		};
		const bulkEdit = vi.fn<CalendarApi['bulkEdit']>().mockResolvedValueOnce(pastPlan);
		const { state } = bulkOf(bulkEdit);

		state.instruction = 'move all to last wednesday';
		await state.runSmart(IDS);
		expect(state.pastWarning).toBe(false);

		await state.runSmart(IDS);
		expect(state.pastWarning).toBe(true);
		expect(bulkEdit).toHaveBeenCalledTimes(1);

		// "Apply anyway" is the same call with force, echoing the reviewed plan.
		bulkEdit.mockResolvedValueOnce({
			ok: true as const,
			data: { success: true as const, applied: 1 }
		});
		await state.runSmart(IDS, true);
		expect(bulkEdit).toHaveBeenCalledTimes(2);
		expect(state.pastWarning).toBe(false);
	});

	it('says so when the instruction matches nothing', async () => {
		const bulkEdit = vi.fn<CalendarApi['bulkEdit']>(async () => ({
			ok: true as const,
			data: { success: true as const, plan: [] }
		}));
		const { state } = bulkOf(bulkEdit);
		state.instruction = 'do the thing';
		await state.runSmart(IDS);
		expect(state.error).toBe('Could not match that instruction. Try naming a date or the events.');
	});

	it('reports the misparsed phrase once', async () => {
		const bulkEdit = vi.fn<CalendarApi['bulkEdit']>(async () => ({
			ok: true as const,
			data: { success: true as const, plan: [] }
		}));
		const report = vi.fn(async () => true);
		const { state } = bulkOf(bulkEdit, { report });
		state.instruction = 'do the thing';
		await state.runSmart(IDS);

		await state.reportPhrase(IDS);
		expect(report).toHaveBeenCalledWith({
			phrase: 'do the thing',
			matched: { instruction: 'do the thing', eventCount: 1, plannedOps: [] }
		});
		expect(state.reported).toBe(true);
	});
});

describe('reset', () => {
	it('drops every bar state when selection mode ends', () => {
		const bulkEdit = vi.fn<CalendarApi['bulkEdit']>();
		const { state } = bulkOf(bulkEdit);
		state.location = 'Hall';
		state.attendants = 'Ann';
		state.instruction = 'move';
		state.confirmDelete = true;
		state.moreTools = true;
		state.error = 'nope';

		state.reset();

		expect(state.location).toBe('');
		expect(state.attendants).toBe('');
		expect(state.instruction).toBe('');
		expect(state.confirmDelete).toBe(false);
		expect(state.moreTools).toBe(false);
		expect(state.error).toBe('');
	});
});
