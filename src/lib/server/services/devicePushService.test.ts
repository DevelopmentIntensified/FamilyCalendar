import { describe, it, expect, vi } from 'vitest';
import {
	sendNotificationToDevices,
	sendDataToUsers,
	type DevicePushDeps
} from './devicePushService';
import type { FcmMessage, FcmSendResult } from './fcmService';

type Row = { userId: string; token: string };

function makeDeps(rows: Row[], results: Record<string, FcmSendResult> = {}, configured = true) {
	const sent: { token: string; message: FcmMessage }[] = [];
	const deps = {
		sender: vi.fn(() =>
			configured
				? {
						send: vi.fn(async (token: string, message: FcmMessage) => {
							sent.push({ token, message });
							return results[token] ?? 'sent';
						})
					}
				: null
		),
		listTokens: vi.fn(async (userIds: string[]) => rows.filter((r) => userIds.includes(r.userId))),
		pruneToken: vi.fn(async () => {})
	} satisfies DevicePushDeps;
	return { deps, sent };
}

describe('sendNotificationToDevices', () => {
	it('sends a notification message to every token of the user', async () => {
		const { deps, sent } = makeDeps([
			{ userId: 'u1', token: 'a' },
			{ userId: 'u1', token: 'b' },
			{ userId: 'u2', token: 'c' }
		]);

		await sendNotificationToDevices('u1', { title: 'T', body: 'B', link: '/l' }, deps);

		expect(deps.listTokens).toHaveBeenCalledWith(['u1']);
		expect(sent.map((s) => s.token).sort()).toEqual(['a', 'b']);
		expect(sent[0].message.notification).toEqual({ title: 'T', body: 'B' });
		expect(sent[0].message.data).toEqual({ type: 'notification', link: '/l' });
	});

	it('prunes tokens FCM reports unregistered, keeps the rest', async () => {
		const { deps } = makeDeps(
			[
				{ userId: 'u1', token: 'dead' },
				{ userId: 'u1', token: 'live' },
				{ userId: 'u1', token: 'flaky' }
			],
			{ dead: 'unregistered', flaky: 'failed' }
		);

		await sendNotificationToDevices('u1', { title: 'T', body: 'B' }, deps);

		expect(deps.pruneToken).toHaveBeenCalledTimes(1);
		expect(deps.pruneToken).toHaveBeenCalledWith('dead');
	});

	it('skips silently (no db read) when FCM is not configured', async () => {
		const { deps } = makeDeps([{ userId: 'u1', token: 'a' }], {}, false);
		await sendNotificationToDevices('u1', { title: 'T', body: 'B' }, deps);
		expect(deps.listTokens).not.toHaveBeenCalled();
	});

	it('never throws when the token lookup fails', async () => {
		const { deps } = makeDeps([]);
		deps.listTokens.mockRejectedValueOnce(new Error('db down'));
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			sendNotificationToDevices('u1', { title: 'T', body: 'B' }, deps)
		).resolves.toBeUndefined();
		spy.mockRestore();
	});
});

describe('sendDataToUsers', () => {
	it('sends one data-only events_changed message per token across users (users deduped)', async () => {
		const { deps, sent } = makeDeps([
			{ userId: 'u1', token: 'a' },
			{ userId: 'u2', token: 'b' },
			{ userId: 'u3', token: 'c' }
		]);

		await sendDataToUsers(['u1', 'u2', 'u1'], { type: 'events_changed' }, deps);

		expect(deps.listTokens).toHaveBeenCalledTimes(1);
		expect(deps.listTokens).toHaveBeenCalledWith(['u1', 'u2']);
		expect(sent.map((s) => s.token).sort()).toEqual(['a', 'b']);
		for (const s of sent) {
			expect(s.message).toEqual({
				data: { type: 'events_changed' },
				android: { priority: 'high', collapse_key: 'events_changed', ttl: '600s' }
			});
		}
	});

	it('prunes unregistered tokens', async () => {
		const { deps } = makeDeps([{ userId: 'u1', token: 'dead' }], { dead: 'unregistered' });
		await sendDataToUsers(['u1'], { type: 'events_changed' }, deps);
		expect(deps.pruneToken).toHaveBeenCalledWith('dead');
	});

	it('does nothing for an empty audience or when not configured', async () => {
		const a = makeDeps([{ userId: 'u1', token: 'a' }]);
		await sendDataToUsers([], { type: 'events_changed' }, a.deps);
		expect(a.deps.listTokens).not.toHaveBeenCalled();

		const b = makeDeps([{ userId: 'u1', token: 'a' }], {}, false);
		await sendDataToUsers(['u1'], { type: 'events_changed' }, b.deps);
		expect(b.deps.listTokens).not.toHaveBeenCalled();
	});
});
