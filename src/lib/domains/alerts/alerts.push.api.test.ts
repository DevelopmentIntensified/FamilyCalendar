/**
 * The browser push flow, in node with a fake environment and a fake api: the
 * permission call ordering, the service-worker and key gates, reusing a live
 * subscription, the local unsubscribe on refusal, and the failure copy.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it, vi } from 'vitest';
import type { AlertsPushApi, BrowserPushSubscription, PushEnvironment } from './alerts.push.api';
import { getPushState, pushFailureText } from './alerts.push.api';
import { subscribeToPush, unsubscribeFromPush } from './alerts.push.subscribe.api';

function subscription(endpoint = 'https://push.example/1'): BrowserPushSubscription {
	return {
		endpoint,
		keys: { p256dh: 'key', auth: 'auth' },
		unsubscribe: vi.fn(async () => true)
	};
}

function fakeEnv(over: Partial<PushEnvironment> = {}): PushEnvironment {
	return {
		supported: () => true,
		secure: () => true,
		permission: () => 'default',
		requestPermission: async () => 'granted',
		registration: async () => null,
		...over
	};
}

function fakeApi(over: Partial<AlertsPushApi> = {}): AlertsPushApi {
	return {
		publicKey: async () => ({ ok: true as const, data: { publicKey: 'dGVzdA==' } }),
		subscribePush: async () => ({ ok: true as const, data: { success: true as const } }),
		unsubscribePush: async () => ({ ok: true as const, data: { success: true as const } }),
		...over
	};
}

describe('pushFailureText', () => {
	it('has a sentence for every reason and a fallback', () => {
		expect(pushFailureText('unsupported')).toContain('support');
		expect(pushFailureText('no-server-key')).toContain('configured');
		expect(pushFailureText('permission-denied')).toContain('blocked');
		expect(pushFailureText('server-rejected')).toContain('rejected');
		expect(pushFailureText('no-service-worker')).toContain('ready');
		expect(pushFailureText('not-secure-context')).toContain('HTTPS');
		expect(pushFailureText('subscribe-failed')).toContain('subscribe');
		expect(pushFailureText('network-error')).toContain('Network');
		expect(pushFailureText()).toBe("Couldn't enable notifications.");
		expect(pushFailureText('error')).toBe("Couldn't enable notifications.");
	});
});

describe('getPushState', () => {
	it('is unsupported when the browser lacks the APIs', async () => {
		expect(await getPushState(fakeEnv({ supported: () => false }))).toBe('unsupported');
	});

	it('is denied when permission is blocked, before looking for a subscription', async () => {
		const registration = vi.fn(async () => null);
		expect(await getPushState(fakeEnv({ permission: () => 'denied', registration }))).toBe(
			'denied'
		);
		expect(registration).not.toHaveBeenCalled();
	});

	it('is subscribed when a live subscription exists', async () => {
		const env = fakeEnv({
			registration: async () => ({
				existing: async () => subscription(),
				subscribe: async () => subscription()
			})
		});
		expect(await getPushState(env)).toBe('subscribed');
	});

	it('is unsubscribed when there is none', async () => {
		expect(await getPushState(fakeEnv())).toBe('unsubscribed');
	});
});

describe('subscribeToPush', () => {
	it('asks permission first, before any other I/O', async () => {
		const steps: string[] = [];
		const env = fakeEnv({
			requestPermission: async () => {
				steps.push('permission');
				return 'granted';
			},
			registration: async () => {
				steps.push('registration');
				return {
					existing: async () => subscription(),
					subscribe: async () => subscription()
				};
			}
		});
		const api = fakeApi();
		const publicKey = vi.spyOn(api, 'publicKey').mockImplementation(async () => {
			steps.push('key');
			return { ok: true as const, data: { publicKey: 'dGVzdA==' } };
		});
		await subscribeToPush(api, env);
		expect(steps[0]).toBe('permission');
		expect(publicKey).toHaveBeenCalledOnce();
	});

	it('refuses an unsupported browser without touching the api', async () => {
		const api = fakeApi();
		const publicKey = vi.spyOn(api, 'publicKey');
		expect(await subscribeToPush(api, fakeEnv({ supported: () => false }))).toEqual({
			ok: false,
			reason: 'unsupported'
		});
		expect(publicKey).not.toHaveBeenCalled();
	});

	it('refuses a non-secure context', async () => {
		expect(await subscribeToPush(fakeApi(), fakeEnv({ secure: () => false }))).toEqual({
			ok: false,
			reason: 'not-secure-context'
		});
	});

	it('returns permission-denied when the prompt is refused', async () => {
		expect(await subscribeToPush(fakeApi(), fakeEnv({ requestPermission: async () => 'denied' }))).toEqual(
			{ ok: false, reason: 'permission-denied' }
		);
	});

	it('returns no-service-worker when no registration exists', async () => {
		expect(await subscribeToPush(fakeApi(), fakeEnv())).toEqual({
			ok: false,
			reason: 'no-service-worker'
		});
	});

	it('returns no-server-key when the server publishes none', async () => {
		const env = fakeEnv({
			registration: async () => ({
				existing: async () => null,
				subscribe: async () => subscription()
			})
		});
		const api = fakeApi({ publicKey: async () => ({ ok: true as const, data: { publicKey: null } }) });
		expect(await subscribeToPush(api, env)).toEqual({ ok: false, reason: 'no-server-key' });
	});

	it('reuses an existing subscription instead of calling subscribe()', async () => {
		const live = subscription();
		const subscribe = vi.fn(async () => subscription('https://push.example/new'));
		const env = fakeEnv({
			registration: async () => ({ existing: async () => live, subscribe })
		});
		const api = fakeApi();
		const post = vi.spyOn(api, 'subscribePush');
		expect(await subscribeToPush(api, env)).toEqual({ ok: true });
		expect(subscribe).not.toHaveBeenCalled();
		expect(post).toHaveBeenCalledWith({
			endpoint: 'https://push.example/1',
			keys: { p256dh: 'key', auth: 'auth' }
		});
	});

	it('creates a subscription when there is none', async () => {
		const created = subscription('https://push.example/new');
		const subscribe = vi.fn(async () => created);
		const env = fakeEnv({
			registration: async () => ({ existing: async () => null, subscribe })
		});
		const api = fakeApi();
		expect(await subscribeToPush(api, env)).toEqual({ ok: true });
		expect(subscribe).toHaveBeenCalledOnce();
	});

	it('drops the subscription locally when the server rejects it', async () => {
		const live = subscription();
		const env = fakeEnv({
			registration: async () => ({ existing: async () => live, subscribe: async () => live })
		});
		const api = fakeApi({
			subscribePush: async () => ({ ok: false as const, status: 500, error: 'boom' })
		});
		expect(await subscribeToPush(api, env)).toEqual({ ok: false, reason: 'server-rejected' });
		expect(live.unsubscribe).toHaveBeenCalledOnce();
	});

	it('keeps the subscription when the request never reached the server', async () => {
		const live = subscription();
		const env = fakeEnv({
			registration: async () => ({ existing: async () => live, subscribe: async () => live })
		});
		const api = fakeApi({
			subscribePush: async () => ({ ok: false as const, status: 0, error: 'Network problem.' })
		});
		expect(await subscribeToPush(api, env)).toEqual({ ok: false, reason: 'network-error' });
		expect(live.unsubscribe).not.toHaveBeenCalled();
	});

	it('returns subscribe-failed when the browser subscribe throws', async () => {
		const env = fakeEnv({
			registration: async () => ({
				existing: async () => null,
				subscribe: async () => {
					throw new Error('Sync manager is unavailable');
				}
			})
		});
		expect(await subscribeToPush(fakeApi(), env)).toEqual({
			ok: false,
			reason: 'subscribe-failed'
		});
	});
});

describe('unsubscribeFromPush', () => {
	it('drops the server row and the browser subscription', async () => {
		const live = subscription();
		const env = fakeEnv({
			registration: async () => ({ existing: async () => live, subscribe: async () => live })
		});
		const api = fakeApi();
		const drop = vi.spyOn(api, 'unsubscribePush');
		await unsubscribeFromPush(api, env);
		expect(drop).toHaveBeenCalledWith({ endpoint: 'https://push.example/1' });
		expect(live.unsubscribe).toHaveBeenCalledOnce();
	});

	it('does nothing when there is no subscription', async () => {
		const api = fakeApi();
		const drop = vi.spyOn(api, 'unsubscribePush');
		await unsubscribeFromPush(api, fakeEnv());
		expect(drop).not.toHaveBeenCalled();
	});
});
