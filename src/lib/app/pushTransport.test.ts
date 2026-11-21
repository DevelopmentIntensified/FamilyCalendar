import { describe, expect, it, vi } from 'vitest';
import type { FcmSender } from '$lib/server/services/fcmService';
import { createPushTransport, type WebPushTransport } from './pushTransport.server';

type WebPushCall = {
	subscription: {
		readonly endpoint: string;
		readonly keys: { readonly p256dh: string; readonly auth: string };
	};
	payload?: string | null;
	options?: {
		readonly vapidDetails?: {
			readonly subject: string;
			readonly publicKey: string;
			readonly privateKey: string;
		};
	};
};

function recordingWebPush(outcome: 'sent' | Error = 'sent') {
	const calls: WebPushCall[] = [];
	const webpush: WebPushTransport = {
		async sendNotification(subscription, payload, options) {
			calls.push({ subscription, payload, options });
			if (outcome !== 'sent') throw outcome;
		}
	};
	return { calls, webpush };
}

function recordingFcm(result: 'sent' | 'unregistered' | 'failed') {
	const calls: { token: string; body: unknown }[] = [];
	const fcm: FcmSender = {
		async send(token, body) {
			calls.push({ token, body });
			return result;
		}
	};
	return { calls, fcm };
}

const config = {
	vapidPublicKey: 'vapid-public',
	vapidPrivateKey: 'vapid-private',
	vapidSubject: 'mailto:admin@familyplanz.com',
	fcmServiceAccount: null
};

const subscription = { endpoint: 'https://push.example.test/a', p256dh: 'p256dh-key', auth: 'auth-key' };
const notice = { title: 'Ada', body: 'Dentist moved to 4pm', link: '/calendar/event/ev-1' };
const deviceBody = {
	notification: { title: 'Ada', body: 'Dentist moved to 4pm' },
	data: { type: 'notification', link: '/calendar/event/ev-1' },
	android: { priority: 'high' as const }
};

describe('createPushTransport', () => {
	it('sends the legacy web-push subscription, payload JSON and VAPID details', async () => {
		const { calls, webpush } = recordingWebPush();
		const push = createPushTransport(config, { webpush, fcm: null });

		await expect(push.send({ channel: 'web', subscription, notice })).resolves.toBe('sent');

		expect(calls).toEqual([
			{
				subscription: {
					endpoint: 'https://push.example.test/a',
					keys: { p256dh: 'p256dh-key', auth: 'auth-key' }
				},
				payload: JSON.stringify(notice),
				options: {
					vapidDetails: {
						subject: 'mailto:admin@familyplanz.com',
						publicKey: 'vapid-public',
						privateKey: 'vapid-private'
					}
				}
			}
		]);
	});

	it('skips web push silently when either VAPID half is unset', async () => {
		const { calls, webpush } = recordingWebPush();
		const push = createPushTransport({ ...config, vapidPrivateKey: null }, { webpush, fcm: null });

		await expect(push.send({ channel: 'web', subscription, notice })).resolves.toBe('skipped');
		expect(calls).toEqual([]);
	});

	it('reports a 404 or 410 subscription as dead and any other refusal as failed', async () => {
		const gone = recordingWebPush(Object.assign(new Error('Gone'), { statusCode: 410 }));
		await expect(
			createPushTransport(config, { webpush: gone.webpush, fcm: null }).send({
				channel: 'web',
				subscription,
				notice
			})
		).resolves.toBe('dead');

		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = recordingWebPush(Object.assign(new Error('boom'), { statusCode: 500 }));
		await expect(
			createPushTransport(config, { webpush: broken.webpush, fcm: null }).send({
				channel: 'web',
				subscription,
				notice
			})
		).resolves.toBe('failed');
		expect(log).toHaveBeenCalledWith('Failed to send push notification:', expect.any(Error));
		log.mockRestore();
	});

	it('sends one device message per token and maps FCM results', async () => {
		const sent = recordingFcm('sent');
		await expect(
			createPushTransport(config, { fcm: sent.fcm }).send({
				channel: 'device',
				token: 'fcm-token-1',
				body: deviceBody
			})
		).resolves.toBe('sent');
		expect(sent.calls).toEqual([{ token: 'fcm-token-1', body: deviceBody }]);

		const unregistered = recordingFcm('unregistered');
		await expect(
			createPushTransport(config, { fcm: unregistered.fcm }).send({
				channel: 'device',
				token: 'dead-token',
				body: deviceBody
			})
		).resolves.toBe('dead');

		const failed = recordingFcm('failed');
		await expect(
			createPushTransport(config, { fcm: failed.fcm }).send({
				channel: 'device',
				token: 'fcm-token-1',
				body: deviceBody
			})
		).resolves.toBe('failed');
	});

	it('skips device sends when FCM is not configured', async () => {
		const push = createPushTransport(config, { fcm: null });

		expect(push.devicesConfigured()).toBe(false);
		await expect(
			push.send({ channel: 'device', token: 'fcm-token-1', body: deviceBody })
		).resolves.toBe('skipped');
	});

	it('reports the VAPID public key and the FCM gate', () => {
		const { fcm } = recordingFcm('sent');
		const configured = createPushTransport(config, { fcm });
		const unconfigured = createPushTransport({ ...config, vapidPublicKey: null }, { fcm: null });

		expect(configured.webPublicKey()).toBe('vapid-public');
		expect(configured.devicesConfigured()).toBe(true);
		expect(unconfigured.webPublicKey()).toBeNull();
	});
});
