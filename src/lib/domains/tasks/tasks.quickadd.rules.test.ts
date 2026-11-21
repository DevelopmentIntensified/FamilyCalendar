import { describe, it, expect } from 'vitest';
import type { TaskQuickAddResult } from '$lib/domains/parsing';
import {
	buildTaskQuickAddBody,
	bulkAddedMessage,
	bulkFailedMessage,
	endOfDayIso,
	shortTaskTitle,
	splitTaskRecords,
	taskQuickAddRefusal
} from './tasks.quickadd.rules';

const NOW = new Date(2026, 8, 15, 12, 0, 0, 0);

const parsed = (overrides: Partial<TaskQuickAddResult> = {}): TaskQuickAddResult => ({
	title: 'Buy milk',
	dueDate: null,
	priority: 'normal',
	priorityStated: false,
	assignedTo: null,
	tags: [],
	recurrenceFrequency: null,
	recurrenceInterval: null,
	visibility: 'public',
	visibilityExplicit: false,
	familyTask: false,
	unknownMember: null,
	hasInfo: false,
	summaryLabel: null,
	...overrides
});

const fallbacks = {
	dueDateFallback: null,
	visibilityFallback: 'private',
	familyId: 'f1',
	category: null,
	now: NOW
};

describe('taskQuickAddRefusal', () => {
	it('refuses an unmatched @member instead of dropping it', () => {
		expect(taskQuickAddRefusal(parsed({ unknownMember: '@zoe' }), 'f1')).toBe(
			'Unknown member @zoe — check the spelling or pick someone from your family.'
		);
	});

	it('refuses @family with no family', () => {
		expect(taskQuickAddRefusal(parsed({ familyTask: true }), null)).toBe(
			"@family needs a family — you're not in one yet."
		);
		expect(taskQuickAddRefusal(parsed({ familyTask: true }), 'f1')).toBeNull();
	});
});

describe('buildTaskQuickAddBody', () => {
	it('takes the parsed title, tags and assignee', () => {
		expect(
			buildTaskQuickAddBody(parsed({ title: 'Buy milk', tags: ['home'], assignedTo: 'u2' }), fallbacks)
		).toMatchObject({ title: 'Buy milk', tags: ['home'], assignedTo: 'u2', familyId: null });
	});

	it('lets an explicit #public/#private win over the picker', () => {
		expect(
			buildTaskQuickAddBody(parsed({ visibilityExplicit: true, visibility: 'public' }), fallbacks)
		).toMatchObject({ visibility: 'public' });
		expect(buildTaskQuickAddBody(parsed(), fallbacks)).toMatchObject({ visibility: 'private' });
	});

	it('files @family in the family and a personal Task with familyId null', () => {
		expect(buildTaskQuickAddBody(parsed({ familyTask: true }), fallbacks)).toMatchObject({
			familyId: 'f1'
		});
		expect(buildTaskQuickAddBody(parsed(), fallbacks)).toMatchObject({ familyId: null });
	});

	it('falls back to the picker, and to end of day for a cadence with no date', () => {
		expect(
			buildTaskQuickAddBody(parsed(), { ...fallbacks, dueDateFallback: '2026-09-20T23:59:00' })
		).toMatchObject({ dueDate: '2026-09-20T23:59:00' });
		expect(
			buildTaskQuickAddBody(parsed({ recurrenceFrequency: 'weekly', recurrenceInterval: 1 }), fallbacks)
		).toMatchObject({ dueDate: endOfDayIso(NOW) });
		expect(buildTaskQuickAddBody(parsed(), fallbacks)).toMatchObject({ dueDate: null });
	});

	it('drops a blank category and keeps a named one', () => {
		expect(buildTaskQuickAddBody(parsed(), fallbacks)).not.toHaveProperty('category');
		expect(buildTaskQuickAddBody(parsed(), { ...fallbacks, category: ' School ' })).toMatchObject({
			category: 'School'
		});
	});
});

describe('endOfDayIso', () => {
	it('is today at 23:59 local', () => {
		const end = new Date(endOfDayIso(NOW));
		expect(end.getHours()).toBe(23);
		expect(end.getMinutes()).toBe(59);
	});
});

describe('splitTaskRecords', () => {
	it('splits a plain list one per line and strips bullets/numbers', () => {
		expect(splitTaskRecords('• Buy milk\n2. Walk the dog\n\n')).toEqual([
			{ text: 'Buy milk', tag: '' },
			{ text: 'Walk the dog', tag: '' }
		]);
	});

	it('joins a Canvas dump into single records with the term year pinned', () => {
		const records = splitTaskRecords(
			'Overdue assignments\nEssay\nDue Sep 10\n10 / 10 pts\nQuiz\nDue Oct 2'
		);
		expect(records).toHaveLength(2);
		expect(records[0]?.text).toContain('Essay');
		expect(records[0]?.text).toContain(`${new Date().getFullYear()}`);
		expect(records[1]?.text).toContain('Oct 2');
	});
});

describe('bulk copy', () => {
	it('names the count and the failures', () => {
		expect(bulkAddedMessage(1, 1)).toBe('Added 1 task.');
		expect(bulkAddedMessage(3, 3)).toBe('Added 3 tasks.');
		expect(bulkFailedMessage(2, 3, ['Essay', 'Quiz'])).toBe('Added 2 of 3 — failed: Essay, Quiz.');
		expect(shortTaskTitle('x'.repeat(41))).toBe(`${'x'.repeat(40)}…`);
		expect(shortTaskTitle('short')).toBe('short');
	});
});
