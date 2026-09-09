import { describe, it, expect } from 'vitest';
import { buildEditPayload, inputToIso, parseEditTags } from './taskEditPayload';
import type { EditDraft } from '$lib/components/tasks/EditTaskDialog.svelte';

const draft: EditDraft = {
	title: '  Mow the lawn  ',
	notes: '  shed  ',
	due: '2026-09-10',
	freq: 'weekly',
	interval: 2,
	assignedTo: 'u2',
	priority: 'high',
	visibility: 'public',
	tags: 'Yard, #yard, , SHED'
};

describe('parseEditTags', () => {
	it('trims, lowercases, strips #, dedupes, drops empties', () => {
		expect(parseEditTags('Yard, #yard, , SHED, shed')).toEqual(['yard', 'shed']);
		expect(parseEditTags('')).toEqual([]);
	});
});

describe('inputToIso', () => {
	it('maps empty to null and dates to end-of-day ISO', () => {
		expect(inputToIso('')).toBeNull();
		expect(inputToIso('2026-09-10')).toBe(
			new Date(2026, 8, 10, 23, 59, 0, 0).toISOString()
		);
	});
});

describe('buildEditPayload', () => {
	it('builds the full payload with pending assignment for other assignees', () => {
		const editing = { id: 't1', userId: 'u1', assignedTo: 'u1' };
		const out = buildEditPayload(editing, draft, 'u1');
		expect(out).toEqual({
			payload: {
				title: 'Mow the lawn',
				notes: 'shed',
				dueDate: new Date(2026, 8, 10, 23, 59, 0, 0).toISOString(),
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2,
				assignedTo: 'u2',
				priority: 'high',
				tags: ['yard', 'shed'],
				visibility: 'public',
				assignmentStatus: 'pending'
			}
		});
	});

	it('self-assigns as accepted and drops visibility for non-owners', () => {
		const editing = { id: 't1', userId: 'u1', assignedTo: 'u2' };
		const mine = buildEditPayload(editing, { ...draft, assignedTo: 'u1' }, 'u1');
		expect(mine.payload.assignmentStatus).toBe('accepted');
		const others = buildEditPayload({ ...editing, userId: 'u9', assignedTo: 'u1' }, draft, 'u1');
		// Key present but undefined — JSON.stringify drops it on the wire.
		expect(others.payload.visibility).toBeUndefined();
		expect(JSON.stringify(others.payload)).not.toContain('visibility');
		expect(others.payload.assignmentStatus).toBe('pending');
	});

	it('sends no assignmentStatus when the assignee is unchanged', () => {
		const editing = { id: 't1', userId: 'u1', assignedTo: 'u1' };
		const out = buildEditPayload(editing, draft, 'u1');
		expect(out.payload.assignmentStatus).toBe('pending');
		const same = buildEditPayload({ ...editing, assignedTo: 'u2' }, draft, 'u1');
		expect('assignmentStatus' in same.payload).toBe(false);
	});
});
