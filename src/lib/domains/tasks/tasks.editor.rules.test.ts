import { describe, it, expect } from 'vitest';
import {
	buildTaskEditPayload,
	normalizeTaskCategoryInput,
	parseTaskEditTags,
	taskCategoryNameError,
	taskInputToIso,
	taskIsoToInput,
	type TaskEditDraft
} from './tasks.editor.rules';

const draft = (overrides: Partial<TaskEditDraft> = {}): TaskEditDraft => ({
	title: '  Mow the lawn  ',
	notes: '  ',
	tags: 'Home, #garden, home',
	due: '2026-09-20',
	freq: '',
	interval: 1,
	assignedTo: '',
	priority: 'normal',
	visibility: 'private',
	category: '',
	...overrides
});

describe('parseTaskEditTags', () => {
	it('trims, lowercases, strips #, dedupes and drops empties', () => {
		expect(parseTaskEditTags('Home, #garden, home, , OUTSIDE')).toEqual(['home', 'garden', 'outside']);
	});
});

describe('taskInputToIso / taskIsoToInput', () => {
	it('round-trips a date input through the end-of-day instant', () => {
		const iso = taskInputToIso('2026-09-20');
		expect(iso).not.toBeNull();
		expect(taskIsoToInput(iso)).toBe('2026-09-20');
		expect(taskInputToIso('')).toBeNull();
		expect(taskIsoToInput(null)).toBe('');
	});
});

describe('normalizeTaskCategoryInput / taskCategoryNameError', () => {
	it('trims and blanks', () => {
		expect(normalizeTaskCategoryInput('  School ')).toBe('School');
		expect(normalizeTaskCategoryInput('   ')).toBeNull();
	});

	it('mirrors the server name refusals', () => {
		expect(taskCategoryNameError('  ')).toBe('Name is required');
		expect(taskCategoryNameError('x'.repeat(81))).toBe('Keep it to 80 characters');
		expect(taskCategoryNameError('School')).toBeNull();
	});
});

describe('buildTaskEditPayload', () => {
	const target = { userId: 'u1', assignedTo: null, category: null };

	it('normalizes the plain fields', () => {
		expect(buildTaskEditPayload(target, draft(), 'u1')).toMatchObject({
			title: 'Mow the lawn',
			notes: null,
			recurrenceFrequency: null,
			recurrenceInterval: null,
			tags: ['home', 'garden'],
			priority: 'normal'
		});
	});

	it('sends visibility only to the owner', () => {
		expect(buildTaskEditPayload(target, draft(), 'u1').visibility).toBe('private');
		expect(buildTaskEditPayload(target, draft(), 'u2').visibility).toBeUndefined();
	});

	it('omits an unchanged assignee and sends a changed one with its status', () => {
		expect(buildTaskEditPayload({ ...target, assignedTo: 'u2' }, draft({ assignedTo: 'u2' }), 'u1')).not.toHaveProperty(
			'assignedTo'
		);
		expect(buildTaskEditPayload(target, draft({ assignedTo: 'u2' }), 'u1')).toMatchObject({
			assignedTo: 'u2',
			assignmentStatus: 'pending'
		});
		expect(buildTaskEditPayload(target, draft({ assignedTo: 'u1' }), 'u1')).toMatchObject({
			assignedTo: 'u1',
			assignmentStatus: 'accepted'
		});
		expect(buildTaskEditPayload({ ...target, assignedTo: 'u2' }, draft({ assignedTo: '' }), 'u1')).toMatchObject(
			{ assignedTo: null, assignmentStatus: null }
		);
	});

	it('sends category only when it changed, null to clear', () => {
		expect(buildTaskEditPayload(target, draft({ category: '  ' }), 'u1')).not.toHaveProperty('category');
		expect(buildTaskEditPayload(target, draft({ category: 'School' }), 'u1')).toMatchObject({
			category: 'School'
		});
		expect(
			buildTaskEditPayload({ ...target, category: 'School' }, draft({ category: '' }), 'u1')
		).toMatchObject({ category: null });
	});

	it('floors the interval to at least one', () => {
		expect(
			buildTaskEditPayload(target, draft({ freq: 'weekly', interval: 0 }), 'u1')
		).toMatchObject({ recurrenceFrequency: 'weekly', recurrenceInterval: 1 });
	});
});
