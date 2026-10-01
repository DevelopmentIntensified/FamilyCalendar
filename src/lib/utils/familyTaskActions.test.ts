import { describe, it, expect, vi } from 'vitest';
import {
	advanceTask,
	deleteTask,
	matchesTagFilter,
	nameOf,
	respondToTask,
	toggleTask,
	type ActionTask,
	type TaskActionPayload
} from './familyTaskActions';

const task: ActionTask = { id: 't1', title: 'Mow', dueDate: '2026-09-10', userId: 'u1' };

function mockFetch(body: TaskActionPayload, ok = true) {
	return vi.fn(async () => ({ ok, json: async () => body }));
}

describe('toggleTask', () => {
	it('puts toggleComplete and returns the parsed task', async () => {
		const fetchFn = mockFetch({ task: { id: 't1' } });
		const out = await toggleTask(task, fetchFn);
		expect(out).toEqual({ ok: true, task: { id: 't1' } });
		expect(fetchFn).toHaveBeenCalledWith(
			'/api/tasks/t1',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ toggleComplete: true })
			})
		);
	});

	it('returns the updated row with the fields the recurring feedback reads', async () => {
		// The result was `task: unknown`, so every caller had to guess what came
		// back — and `family/tasks/+page.svelte` failed svelte-check handing it to
		// showRecurringCompleteFeedback. The row is typed now; these are the
		// fields that typing promises (issue 124).
		const fetchFn = mockFetch({
			task: { id: 't1', recurrenceFrequency: 'weekly', dueDate: '2026-09-17' }
		});
		const out = await toggleTask(task, fetchFn);

		if (!out.ok) throw new Error('expected the toggle to succeed');
		expect(out.task).toMatchObject({
			id: 't1',
			recurrenceFrequency: 'weekly',
			dueDate: '2026-09-17'
		});
	});

	it('surfaces server + network errors', async () => {
		expect(await toggleTask(task, mockFetch({ error: 'Nope' }, false))).toEqual({
			ok: false,
			error: 'Nope'
		});
		const down = vi.fn(async () => {
			throw new Error('down');
		});
		expect(await toggleTask(task, down)).toEqual({
			ok: false,
			error: 'Network problem — try again.'
		});
	});
});

describe('advanceTask', () => {
	it('puts advanceToNext', async () => {
		const fetchFn = mockFetch({ task: { id: 't1' } });
		expect(await advanceTask(task, fetchFn)).toEqual({ ok: true, task: { id: 't1' } });
		expect(fetchFn).toHaveBeenCalledWith(
			'/api/tasks/t1',
			expect.objectContaining({ body: JSON.stringify({ advanceToNext: true }) })
		);
	});
});

describe('respondToTask', () => {
	it('puts accepted / declined assignmentStatus', async () => {
		const fetchFn = mockFetch({});
		// A response with no row in it still names the task it acted on, so a
		// caller never has to cope with two different result shapes.
		expect(await respondToTask(task, true, fetchFn)).toEqual({ ok: true, task: { id: 't1' } });
		expect(fetchFn).toHaveBeenCalledWith(
			'/api/tasks/t1',
			expect.objectContaining({ body: JSON.stringify({ assignmentStatus: 'accepted' }) })
		);
		const fetchFn2 = mockFetch({});
		await respondToTask(task, false, fetchFn2);
		expect(fetchFn2).toHaveBeenCalledWith(
			'/api/tasks/t1',
			expect.objectContaining({ body: JSON.stringify({ assignmentStatus: 'declined' }) })
		);
	});
});

describe('deleteTask', () => {
	it('deletes and reports server errors', async () => {
		const fetchFn = mockFetch({});
		expect(await deleteTask(task, fetchFn)).toEqual({ ok: true, task: { id: 't1' } });
		expect(fetchFn).toHaveBeenCalledWith('/api/tasks/t1', { method: 'DELETE' });
		expect(await deleteTask(task, mockFetch({ error: 'Gone' }, false))).toEqual({
			ok: false,
			error: 'Gone'
		});
	});
});

describe('nameOf', () => {
	it('joins names with fallback', () => {
		expect(nameOf('Bo', 'Jo', 'x')).toBe('Bo Jo');
		expect(nameOf(null, null, 'fam')).toBe('fam');
	});
});

describe('matchesTagFilter', () => {
	it('matches tag prefixes case-insensitively, empty passes all', () => {
		expect(matchesTagFilter({ tags: ['Yard'] }, '')).toBe(true);
		expect(matchesTagFilter({ tags: ['Yard'] }, 'ya')).toBe(true);
		expect(matchesTagFilter({ tags: ['Yard'] }, 'YA')).toBe(true);
		expect(matchesTagFilter({ tags: ['Yard'] }, 'zz')).toBe(false);
		expect(matchesTagFilter({}, 'zz')).toBe(false);
	});
});
