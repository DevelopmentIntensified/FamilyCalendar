import { describe, it, expect, vi, afterEach } from 'vitest';
import { FOCUS_SETTLE_MS, sendFocusCommand } from './taskFocus';

function stubFetch(status: number, body: unknown) {
	const fn = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
	vi.stubGlobal('fetch', fn);
	return fn;
}

// #315: the web row posts the SAME device-channel body the phone enqueues
// (#290) — start names the task, stop carries no taskId.
describe('task focus client (#315)', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('POSTs the exact start body', async () => {
		const fn = stubFetch(201, { id: 'c1', command: 'start', taskId: 't9' });
		const out = await sendFocusCommand('t9', false);
		expect(out).toEqual({ ok: true, message: 'Asked TaskFocus to start focus.' });
		expect(fn).toHaveBeenCalledWith('/api/taskfocus/commands', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{"command":"start","taskId":"t9"}'
		});
	});

	it('POSTs the exact stop body, with no taskId', async () => {
		const fn = stubFetch(201, { id: 'c2', command: 'stop', taskId: null });
		const out = await sendFocusCommand('t9', true);
		expect(out).toEqual({ ok: true, message: 'Asked TaskFocus to stop focus.' });
		expect(fn).toHaveBeenCalledWith('/api/taskfocus/commands', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{"command":"stop"}'
		});
	});

	it('404/405 means a server without the channel', async () => {
		stubFetch(404, { error: 'Not Found' });
		expect(await sendFocusCommand('t9', false)).toEqual({
			ok: false,
			error: "This server can't start focus yet."
		});
		stubFetch(405, { error: 'Method Not Allowed' });
		expect((await sendFocusCommand('t9', true)).ok).toBe(false);
	});

	it('surfaces the server error text, and a network failure as its own', async () => {
		stubFetch(400, { error: 'Task not found' });
		expect(await sendFocusCommand('gone', false)).toEqual({ ok: false, error: 'Task not found' });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline');
			})
		);
		expect(await sendFocusCommand('t9', false)).toEqual({
			ok: false,
			error: 'Network problem. Try again.'
		});
	});

	it('waits 4 s for the clock, like the phone', () => {
		expect(FOCUS_SETTLE_MS).toBe(4_000);
	});
});
