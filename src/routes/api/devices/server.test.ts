import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, DELETE, type DevicesDeps } from './+server';

// Untyped vi.fn()s flow into the typed deps seam (no module mocking).
const registerDeviceToken = vi.fn();
const removeDeviceToken = vi.fn();
const deps: DevicesDeps = { registerDeviceToken, removeDeviceToken };

const TOKEN = 'fcm-token-' + 'x'.repeat(140);

function mockEvent(body: unknown, user?: { id: string }, rawJson = true) {
	return (
		// SAFETY: test double — handlers only read request.json() and locals.user.
		{
			request: {
				json: () => (rawJson ? Promise.resolve(body) : Promise.reject(new SyntaxError('bad')))
			},
			locals: user ? { user } : {}
		} as never
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /api/devices', () => {
	it('401 without a user (no Bearer / session)', async () => {
		const res = await POST(mockEvent({ token: TOKEN, platform: 'android' }), deps);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Unauthorized' });
		expect(registerDeviceToken).not.toHaveBeenCalled();
	});

	it('200 {success:true} and upserts the token for the caller', async () => {
		const res = await POST(mockEvent({ token: TOKEN, platform: 'android' }, { id: 'u1' }), deps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		expect(registerDeviceToken).toHaveBeenCalledWith('u1', TOKEN, 'android');
	});

	it('platform defaults to android when omitted', async () => {
		const res = await POST(mockEvent({ token: TOKEN }, { id: 'u1' }), deps);
		expect(res.status).toBe(200);
		expect(registerDeviceToken).toHaveBeenCalledWith('u1', TOKEN, 'android');
	});

	it('trims surrounding whitespace from the token', async () => {
		await POST(mockEvent({ token: `  ${TOKEN}\n` }, { id: 'u1' }), deps);
		expect(registerDeviceToken).toHaveBeenCalledWith('u1', TOKEN, 'android');
	});

	it.each([
		['missing token', {}],
		['empty token', { token: '' }],
		['blank token', { token: '   ' }],
		['non-string token', { token: 42 }],
		['oversized token', { token: 'x'.repeat(4097) }],
		['unknown platform', { token: TOKEN, platform: 'ios' }],
		['non-object body', 'token'],
		['null body', null]
	])('400 on %s', async (_label, body) => {
		const res = await POST(mockEvent(body, { id: 'u1' }), deps);
		expect(res.status).toBe(400);
		expect(await res.json()).toHaveProperty('error');
		expect(registerDeviceToken).not.toHaveBeenCalled();
	});

	it('400 on malformed JSON', async () => {
		const res = await POST(mockEvent(null, { id: 'u1' }, false), deps);
		expect(res.status).toBe(400);
	});
});

describe('DELETE /api/devices', () => {
	it('401 without a user', async () => {
		const res = await DELETE(mockEvent({ token: TOKEN }), deps);
		expect(res.status).toBe(401);
		expect(removeDeviceToken).not.toHaveBeenCalled();
	});

	it("200 and removes only the caller's row", async () => {
		const res = await DELETE(mockEvent({ token: TOKEN }, { id: 'u1' }), deps);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		expect(removeDeviceToken).toHaveBeenCalledWith('u1', TOKEN);
	});

	it.each([
		['missing token', {}],
		['oversized token', { token: 'x'.repeat(4097) }]
	])('400 on %s', async (_label, body) => {
		const res = await DELETE(mockEvent(body, { id: 'u1' }), deps);
		expect(res.status).toBe(400);
		expect(removeDeviceToken).not.toHaveBeenCalled();
	});
});
