import { describe, it, expect, vi } from 'vitest';
import {
	advanceTask,
	deleteTask,
	matchesTagFilter,
	nameOf,
	respondToTask,
	toggleTask,
	type ActionTask
} from './familyTaskActions';

const task: ActionTask = { id: 't1', title: 'Mow', dueDate: '2026-09-10', userId: 'u1' };

function mockFetch(body: { task?: { id: string }; error?: string }, ok = true) {
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
		expect(await respondToTask(task, true, fetchFn)).toEqual({ ok: true, task: {} });
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
		expect(await deleteTask(task, fetchFn)).toEqual({ ok: true, task: {} });
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
