import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, type TaskCategoriesDeps } from './+server';
import { PATCH, DELETE, type TaskCategoryDeps } from './[id]/+server';
import type { TaskCategory } from '$lib/server/db/schema';

// Typed deps seam (no module mocking): the action logic itself is covered by
// src/lib/server/db/actions/taskCategories.test.ts.
const listTaskCategories = vi.fn();
const ensureTaskCategory = vi.fn();
const renameTaskCategory = vi.fn();
const deleteTaskCategory = vi.fn();
const listDeps: TaskCategoriesDeps = { listTaskCategories, ensureTaskCategory };
const itemDeps: TaskCategoryDeps = { renameTaskCategory, deleteTaskCategory };

const T = new Date('2026-11-02T10:00:00.000Z');
const row = (id: string, name: string): TaskCategory => ({
	id,
	userId: 'u1',
	name,
	createdAt: T,
	updatedAt: T
});
const wire = (id: string, name: string) => ({
	id,
	name,
	createdAt: T.toISOString(),
	updatedAt: T.toISOString()
});

function mockEvent(opts: { body?: unknown; user?: { id: string }; id?: string; badJson?: boolean }) {
	return (
		// SAFETY: test double — handlers only read request.json(), locals.user and params.id.
		{
			request: {
				json: () =>
					opts.badJson ? Promise.reject(new SyntaxError('bad')) : Promise.resolve(opts.body)
			},
			locals: opts.user ? { user: opts.user } : {},
			params: { id: opts.id ?? 'c1' }
		} as never
	);
}

const me = { id: 'u1' };

beforeEach(() => {
	vi.clearAllMocks();
});

describe('GET /api/task-categories', () => {
	it('401 without a user', async () => {
		const res = await GET(mockEvent({}), listDeps);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Unauthorized' });
		expect(listTaskCategories).not.toHaveBeenCalled();
	});

	it("200 {categories} — the caller's list, without userId", async () => {
		listTaskCategories.mockResolvedValue([row('c1', 'Errands'), row('c2', 'Work')]);
		const res = await GET(mockEvent({ user: me }), listDeps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ categories: [wire('c1', 'Errands'), wire('c2', 'Work')] });
		expect(listTaskCategories).toHaveBeenCalledWith('u1');
	});
});

describe('POST /api/task-categories', () => {
	it('401 without a user', async () => {
		const res = await POST(mockEvent({ body: { name: 'Work' } }), listDeps);
		expect(res.status).toBe(401);
		expect(ensureTaskCategory).not.toHaveBeenCalled();
	});

	it('200 {category} and adds the trimmed name for the caller', async () => {
		ensureTaskCategory.mockResolvedValue(row('c1', 'Work'));
		const res = await POST(mockEvent({ body: { name: '  Work ' }, user: me }), listDeps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ category: wire('c1', 'Work') });
		expect(ensureTaskCategory).toHaveBeenCalledWith('u1', 'Work');
	});

	it('idempotent: a case-insensitive existing name returns the existing row (200)', async () => {
		ensureTaskCategory.mockResolvedValue(row('c1', 'Work'));
		const res = await POST(mockEvent({ body: { name: 'WORK' }, user: me }), listDeps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ category: wire('c1', 'Work') });
	});

	it.each([
		['missing name', {}, 'name is required'],
		['blank name', { name: '   ' }, 'name is required'],
		['non-string name', { name: 5 }, 'name is required'],
		['null body', null, 'name is required'],
		['81 chars', { name: 'x'.repeat(81) }, 'name is too long']
	])('400 on %s', async (_l, body, error) => {
		const res = await POST(mockEvent({ body, user: me }), listDeps);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error });
		expect(ensureTaskCategory).not.toHaveBeenCalled();
	});

	it('400 on malformed JSON', async () => {
		const res = await POST(mockEvent({ badJson: true, user: me }), listDeps);
		expect(res.status).toBe(400);
	});
});

describe('PATCH /api/task-categories/[id]', () => {
	it('401 without a user', async () => {
		const res = await PATCH(mockEvent({ body: { name: 'X' } }), itemDeps);
		expect(res.status).toBe(401);
		expect(renameTaskCategory).not.toHaveBeenCalled();
	});

	it('200 {category} on rename', async () => {
		renameTaskCategory.mockResolvedValue({ status: 'ok', category: row('c1', 'Deep Work') });
		const res = await PATCH(mockEvent({ body: { name: ' Deep Work ' }, user: me, id: 'c1' }), itemDeps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ category: wire('c1', 'Deep Work') });
		expect(renameTaskCategory).toHaveBeenCalledWith('u1', 'c1', 'Deep Work');
	});

	it('409 on a name clash', async () => {
		renameTaskCategory.mockResolvedValue({ status: 'conflict' });
		const res = await PATCH(mockEvent({ body: { name: 'Home' }, user: me }), itemDeps);
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: 'A category with that name already exists' });
	});

	it('404 when not the caller’s category', async () => {
		renameTaskCategory.mockResolvedValue({ status: 'not_found' });
		const res = await PATCH(mockEvent({ body: { name: 'X' }, user: me }), itemDeps);
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: 'Category not found' });
	});

	it.each([
		['blank', { name: '' }, 'name is required'],
		['too long', { name: 'z'.repeat(81) }, 'name is too long']
	])('400 on %s name', async (_l, body, error) => {
		const res = await PATCH(mockEvent({ body, user: me }), itemDeps);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error });
		expect(renameTaskCategory).not.toHaveBeenCalled();
	});
});

describe('DELETE /api/task-categories/[id]', () => {
	it('401 without a user', async () => {
		const res = await DELETE(mockEvent({}), itemDeps);
		expect(res.status).toBe(401);
		expect(deleteTaskCategory).not.toHaveBeenCalled();
	});

	it('200 {success:true} when deleted', async () => {
		deleteTaskCategory.mockResolvedValue(true);
		const res = await DELETE(mockEvent({ user: me, id: 'c1' }), itemDeps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		expect(deleteTaskCategory).toHaveBeenCalledWith('u1', 'c1');
	});

	it('404 when not the caller’s category', async () => {
		deleteTaskCategory.mockResolvedValue(false);
		const res = await DELETE(mockEvent({ user: me }), itemDeps);
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: 'Category not found' });
	});
});
