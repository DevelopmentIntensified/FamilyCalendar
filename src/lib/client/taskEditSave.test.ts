import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveTaskEdit } from './taskEditSave';
import type { EditDraft } from '$lib/components/tasks/EditTaskDialog.svelte';

const task = { id: 't1', userId: 'u1', assignedTo: null, category: null };
const draft: EditDraft = {
	title: '  Mow the lawn ',
	notes: '',
	tags: '',
	due: '',
	freq: '',
	interval: 1,
	assignedTo: '',
	priority: 'normal',
	visibility: 'public',
	category: ''
};

describe('saveTaskEdit (#283)', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ task: { id: 't1' } }), { status: 200 }))
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('PUTs the edit payload and names the saved task', async () => {
		const out = await saveTaskEdit(task, draft, 'u1');
		expect(out).toEqual({ ok: true, message: 'Saved "Mow the lawn".' });
		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(url).toBe('/api/tasks/t1');
		expect(init?.method).toBe('PUT');
		// SAFETY: saveTaskEdit always sends a JSON string body.
		expect(JSON.parse(init?.body as string).title).toBe('Mow the lawn');
	});

	it('prefers the title the server stored', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			new Response(JSON.stringify({ task: { id: 't1', title: 'Mow lawn' } }), { status: 200 })
		);
		const out = await saveTaskEdit(task, draft, 'u1');
		expect(out).toEqual({ ok: true, message: 'Saved "Mow lawn".' });
	});

	it("names the task and the server's reason on a failed save", async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'category is too long' }), { status: 400 })
		);
		const out = await saveTaskEdit(task, draft, 'u1');
		expect(out).toEqual({
			ok: false,
			error: 'category is too long',
			message: 'Couldn\'t save "Mow the lawn" — category is too long'
		});
	});

	it('falls back to a retry hint when the server gives no reason', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
		const out = await saveTaskEdit(task, draft, 'u1');
		expect(out).toEqual({
			ok: false,
			error: "That didn't work. Try again.",
			message: 'Couldn\'t save "Mow the lawn" — try again.'
		});
	});

	it('says so when the network fails', async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'));
		const out = await saveTaskEdit(task, draft, 'u1');
		expect(out).toEqual({
			ok: false,
			error: 'Network problem. Try again.',
			message: 'Couldn\'t save "Mow the lawn" — check your connection.'
		});
	});
});
