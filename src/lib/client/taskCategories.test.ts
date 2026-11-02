import { describe, it, expect, vi, afterEach } from 'vitest';
import { renameTaskCategory, deleteTaskCategory } from './taskCategories';

function stubFetch(status: number, body: unknown) {
	const fn = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
	vi.stubGlobal('fetch', fn);
	return fn;
}

describe('task category client (#280)', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('PATCHes a rename and returns the category', async () => {
		const fn = stubFetch(200, { category: { id: 'c1', name: 'Deep Work' } });
		const out = await renameTaskCategory('c1', 'Deep Work');
		expect(out).toEqual({ ok: true, category: { id: 'c1', name: 'Deep Work' } });
		expect(fn).toHaveBeenCalledWith('/api/task-categories/c1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Deep Work' })
		});
	});

	it('surfaces the server 409 message', async () => {
		stubFetch(409, { error: 'A category with that name already exists' });
		const out = await renameTaskCategory('c1', 'Home');
		expect(out).toEqual({
			ok: false,
			status: 409,
			error: 'A category with that name already exists'
		});
	});

	it('DELETEs and reports ok; network failure is an error', async () => {
		const fn = stubFetch(200, { success: true });
		expect(await deleteTaskCategory('c 1')).toEqual({ ok: true });
		expect(fn).toHaveBeenCalledWith('/api/task-categories/c%201', { method: 'DELETE' });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline');
			})
		);
		const out = await deleteTaskCategory('c1');
		expect(out.ok).toBe(false);
	});
});
