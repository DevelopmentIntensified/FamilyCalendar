import { describe, it, expect } from 'vitest';
import { buildTaskRow } from './tasks.ui.fixtures';
import {
	formatTaskDue,
	taskFocusText,
	taskMetaSlots,
	taskPriorityDot,
	taskPriorityLabel,
	taskRecurrenceLabel,
	taskRecurringCompleteText,
	taskRecurringSkipText,
	taskShortDate,
	taskFreqNoun
} from './tasks.display.rules';

const NOW = new Date(2026, 8, 15, 12, 0, 0, 0);

describe('formatTaskDue', () => {
	it('returns empty for missing or unparseable dates', () => {
		expect(formatTaskDue(null, NOW)).toBe('');
		expect(formatTaskDue('not-a-date', NOW)).toBe('');
	});

	it('omits the year for the current one, keeps it otherwise', () => {
		expect(formatTaskDue('2026-09-10', NOW)).toBe(
			new Date('2026-09-10T00:00:00').toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric'
			})
		);
		expect(formatTaskDue('2001-01-05', NOW)).toContain('2001');
	});
});

describe('taskShortDate', () => {
	it('adds the weekday and the year only when it is another year', () => {
		expect(taskShortDate('2026-09-19', NOW)).toBe(
			new Date('2026-09-19T00:00:00').toLocaleDateString(undefined, {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			})
		);
		expect(taskShortDate('2027-01-09', NOW)).toContain('2027');
		expect(taskShortDate(null, NOW)).toBe('');
	});
});

describe('taskFreqNoun', () => {
	it.each([
		['daily', 'day'],
		['weekly', 'week'],
		['monthly', 'month'],
		['yearly', 'year'],
		['fortnightly', undefined],
		[null, undefined]
	])('%s → %s', (frequency, noun) => {
		expect(taskFreqNoun(frequency)).toBe(noun);
	});
});

describe('taskRecurrenceLabel', () => {
	it('prints the cadence and the completion tally', () => {
		expect(
			taskRecurrenceLabel(buildTaskRow({ recurrenceFrequency: 'weekly', recurrenceInterval: 1 }))
		).toBe('↻ every week');
		expect(
			taskRecurrenceLabel(
				buildTaskRow({ recurrenceFrequency: 'weekly', recurrenceInterval: 2, completionCount: 3 })
			)
		).toBe('↻ every 2 weeks · done 3×');
		expect(taskRecurrenceLabel(buildTaskRow())).toBeNull();
	});
});

describe('priority display', () => {
	it.each([
		['high', 'High', 'bg-red-500'],
		['normal', 'Normal', 'bg-slate-300'],
		['low', 'Low', 'bg-slate-200'],
		['weird', 'weird', 'bg-slate-300']
	])('%s → %s', (priority, label, dot) => {
		expect(taskPriorityLabel(priority)).toBe(label);
		expect(taskPriorityDot(priority)).toBe(dot);
	});
});

describe('focus text', () => {
	it('says nothing for an untimed task', () => {
		expect(taskFocusText(null, null, NOW)).toBeNull();
		expect(taskFocusText(0, null, NOW)).toBeNull();
	});

	it('reports logged minutes, then the live span on top of them', () => {
		expect(taskFocusText(5, null, NOW)).toBe('5m focus');
		expect(taskFocusText(5, new Date(NOW.getTime() - 90_000).toISOString(), NOW)).toBe(
			'Focusing · 6m'
		);
		expect(taskFocusText(null, new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe(
			'Focusing'
		);
	});
});

describe('meta slots', () => {
	it('joins each fact once, in the row order', () => {
		const task = buildTaskRow({
			dueDate: '2026-09-10T23:59:00.000Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			category: 'School',
			tags: ['home'],
			priority: 'high',
			familyId: 'f1',
			notes: 'not shown when recurring',
			eventTitle: 'not shown either'
		});
		expect(taskMetaSlots(task, '5m focus', NOW).map((slot) => slot.kind)).toEqual([
			'due',
			'late',
			'focus',
			'recur',
			'category',
			'tag',
			'priority',
			'family',
			'who'
		]);
	});

	it('falls back event → note and prints "unassigned" only without a person', () => {
		const withEvent = buildTaskRow({ eventTitle: 'Dentist', notes: 'bring card' });
		expect(taskMetaSlots(withEvent, null, NOW).find((slot) => slot.kind === 'event')?.text).toBe(
			'Dentist'
		);
		const withNote = buildTaskRow({ notes: 'bring card' });
		expect(taskMetaSlots(withNote, null, NOW).find((slot) => slot.kind === 'note')?.text).toBe(
			'bring card'
		);
		expect(taskMetaSlots(withNote, null, NOW).some((slot) => slot.kind === 'who')).toBe(true);
		expect(
			taskMetaSlots(buildTaskRow({ assignedTo: 'u2', assignmentStatus: 'accepted' }), null, NOW).some(
				(slot) => slot.kind === 'who'
			)
		).toBe(false);
	});
});

describe('recurring toasts', () => {
	it('names the cadence, the streak and the next occurrence', () => {
		const updated = {
			id: 't1',
			recurrenceFrequency: 'weekly',
			dueDate: '2026-09-19T23:59:00.000Z'
		};
		expect(taskRecurringCompleteText(updated, NOW)).toBe(
			`✅ Done for this week — counts toward your streak. Next: ${taskShortDate(updated.dueDate, NOW)}.`
		);
		expect(taskRecurringSkipText(updated, NOW)).toBe(
			`Skipped this occurrence — not counted toward your streak. Next: ${taskShortDate(updated.dueDate, NOW)}.`
		);
	});

	it('says "occurrence" without a cadence; a one-off skip stays plain', () => {
		expect(
			taskRecurringCompleteText({ id: 't1', recurrenceFrequency: null, dueDate: null }, NOW)
		).toBe('✅ Done for this occurrence — counts toward your streak.');
		expect(taskRecurringSkipText({ id: 't1', recurrenceFrequency: null }, NOW)).toBe(
			'Skipped this occurrence.'
		);
	});
});
