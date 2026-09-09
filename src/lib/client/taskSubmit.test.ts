import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitTaskQuickAdd } from './taskSubmit';

const members = [{ userId: 'u1', firstName: 'Ana', lastName: 'A' }];

describe('submitTaskQuickAdd', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: true, json: async () => ({ task: { id: 't1' } }) }))
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('posts the parsed payload and returns the task', async () => {
		const result = await submitTaskQuickAdd({
			title: 'Buy milk tomorrow',
			dueDateFallback: null,
			visibilityFallback: 'public',
			familyId: null,
			members
		});
		expect(result.ok).toBe(true);
		expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
		// SAFETY: the stubbed fetch is called with (url, { body }) in submitTaskQuickAdd.
		const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body as string);
		expect(body.title).toBe('Buy milk');
		expect(body.dueDate).not.toBeNull();
	});

	it('blocks unknown @members without fetching', async () => {
		const result = await submitTaskQuickAdd({
			title: 'Call @zed',
			dueDateFallback: null,
			visibilityFallback: 'public',
			familyId: null,
			members
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('zed');
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
	});

	it('blocks @family without a family', async () => {
		const result = await submitTaskQuickAdd({
			title: 'Party @family',
			dueDateFallback: null,
			visibilityFallback: 'public',
			familyId: null,
			members
		});
		expect(result.ok).toBe(false);
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
	});

	it('uses the due-date fallback for bare recurrences', async () => {
		const result = await submitTaskQuickAdd({
			title: 'Standup every day',
			dueDateFallback: '2026-09-08T23:59:00.000Z',
			visibilityFallback: 'private',
			familyId: 'f1',
			members
		});
		expect(result.ok).toBe(true);
		// SAFETY: the stubbed fetch is called with (url, { body }) in submitTaskQuickAdd.
		const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body as string);
		expect(body.dueDate).toBe('2026-09-08T23:59:00.000Z');
		expect(body.visibility).toBe('private');
		expect(body.familyId).toBeNull();
	});

	it('passes API errors through', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Bad date' }) }))
		);
		const result = await submitTaskQuickAdd({
			title: 'Buy milk',
			dueDateFallback: null,
			visibilityFallback: 'public',
			familyId: null,
			members
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('Bad date');
	});
});
