import { describe, expect, it } from 'vitest';
import { createMemoryPush } from './push';

describe('createMemoryPush', () => {
	it('records a web message and a device message in send order', async () => {
		const push = createMemoryPush();
		const web = {
			channel: 'web' as const,
			subscription: { endpoint: 'https://push.example.test/a', p256dh: 'p', auth: 'a' },
			notice: { title: 'Ada', body: 'Dentist moved to 4pm', link: '/calendar/event/ev-1' }
		};
		const device = {
			channel: 'device' as const,
			token: 'fcm-token-1',
			body: {
				notification: { title: 'Ada', body: 'Dentist moved to 4pm' },
				data: { type: 'notification', link: '/calendar/event/ev-1' },
				android: { priority: 'high' as const }
			}
		};

		expect(push.sent).toEqual([]);
		await expect(push.send(web)).resolves.toBe('sent');
		await push.send(device);

		expect(push.sent).toEqual([web, device]);
	});

	it('answers the scripted deliveries in order, then sent', async () => {
		const push = createMemoryPush();
		push.willDeliver('dead', 'failed', 'skipped');

		const message = { channel: 'device' as const, token: 't', body: {} };

		expect(await push.send(message)).toBe('dead');
		expect(await push.send(message)).toBe('failed');
		expect(await push.send(message)).toBe('skipped');
		expect(await push.send(message)).toBe('sent');
	});

	it('reports the VAPID public key and the FCM gate from its options', () => {
		const configured = createMemoryPush({ webPublicKey: 'vapid-public', devicesConfigured: false });

		expect(configured.webPublicKey()).toBe('vapid-public');
		expect(configured.devicesConfigured()).toBe(false);
		expect(createMemoryPush().webPublicKey()).toBeNull();
		expect(createMemoryPush().devicesConfigured()).toBe(true);
	});
});
