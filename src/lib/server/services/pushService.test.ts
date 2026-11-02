import { describe, it, expect, vi } from 'vitest';
import { sendPushToUser, type PushChannels } from './pushService';

const payload = { title: 'T', body: 'B', link: '/x' };

describe('sendPushToUser (#272 fan-out)', () => {
	it('sends to web subscriptions and FCM devices in parallel', async () => {
		const order: string[] = [];
		let releaseWeb: () => void = () => {};
		const channels: PushChannels = {
			web: vi.fn(
				() =>
					new Promise<void>((resolve) => {
						order.push('web:start');
						releaseWeb = () => {
							order.push('web:end');
							resolve();
						};
					})
			),
			devices: vi.fn(async () => {
				order.push('devices:start');
			})
		};

		const done = sendPushToUser('u1', payload, channels);
		// Devices started while web is still pending — not sequential.
		await Promise.resolve();
		expect(order).toEqual(['web:start', 'devices:start']);
		releaseWeb();
		await done;

		expect(channels.web).toHaveBeenCalledWith('u1', payload);
		expect(channels.devices).toHaveBeenCalledWith('u1', payload);
	});

	it('one channel failing never blocks the other or rejects', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const devices = vi.fn(async () => {});
		await expect(
			sendPushToUser('u1', payload, {
				web: vi.fn(async () => {
					throw new Error('vapid boom');
				}),
				devices
			})
		).resolves.toBeUndefined();
		expect(devices).toHaveBeenCalledOnce();

		const web = vi.fn(async () => {});
		await expect(
			sendPushToUser('u1', payload, {
				web,
				devices: vi.fn(async () => {
					throw new Error('fcm boom');
				})
			})
		).resolves.toBeUndefined();
		expect(web).toHaveBeenCalledOnce();
		spy.mockRestore();
	});
});
