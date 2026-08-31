import { describe, it, expect, vi, afterEach } from 'vitest';
import { pushFailureText, subscribeToPush } from './pushClient';

afterEach(() => {
	vi.unstubAllGlobals();
});

const dummySubscription = {
	endpoint: 'https://fcm.googleapis.com/dummy',
	toJSON: () => ({
		endpoint: 'https://fcm.googleapis.com/dummy',
		keys: { p256dh: 'a', auth: 'b' }
	}),
	unsubscribe: vi.fn().mockResolvedValue(true)
};

/** Stub window/Notification so isPushSupported() passes and permission resolves. */
function stubBaseGlobals(permission = 'granted') {
	vi.stubGlobal('window', {
		isSecureContext: true,
		PushManager: true,
		Notification: {
			permission,
			requestPermission: vi.fn().mockResolvedValue(permission)
		}
	});
}

/** Stub navigator.serviceWorker returning a registration with the given pushManager behavior. */
function makeRegistration(
	{ subscription = null, subscribeImpl }: {
		subscription?: typeof dummySubscription | null;
		subscribeImpl?: ReturnType<typeof vi.fn>;
	} = {}
) {
	const pushManager = {
		getSubscription: vi.fn().mockResolvedValue(subscription),
		subscribe: subscribeImpl ?? vi.fn().mockResolvedValue(dummySubscription)
	};
	const registration = { pushManager };
	vi.stubGlobal('navigator', {
		serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) }
	});
	return registration;
}

/** Stub fetch: first call serves the VAPID public key, then optional subscribe-handler. */
function stubFetch({
	subscribeStatus = 200,
	subscribeThrows = false
}: { subscribeStatus?: number; subscribeThrows?: boolean } = {}) {
	const subscribeFn = subscribeThrows
		? vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
		: vi.fn().mockResolvedValue(new Response(null, { status: subscribeStatus }));
	return vi
		.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ publicKey: 'dGVzdA==' }), { status: 200 })
				)
				.mockImplementationOnce(() => subscribeFn())
		);
}

describe('pushFailureText', () => {
	it('defaults to the generic message when no reason is known', () => {
		expect(pushFailureText()).toBe("Couldn't enable notifications.");
		expect(pushFailureText('error')).toBe("Couldn't enable notifications.");
	});

	it('explains each specific failure reason', () => {
		expect(pushFailureText('unsupported')).toContain('support');
		expect(pushFailureText('no-server-key')).toContain('configured');
		expect(pushFailureText('permission-denied')).toContain('blocked');
		expect(pushFailureText('server-rejected')).toContain('rejected');
	});

	it('explains the new failure reasons added for diagnostics', () => {
		expect(pushFailureText('no-service-worker')).toContain('ready');
		expect(pushFailureText('not-secure-context')).toContain('HTTPS');
		expect(pushFailureText('subscribe-failed')).toContain('subscribe');
		expect(pushFailureText('network-error')).toContain('Network');
	});
});

describe('subscribeToPush branching', () => {
	it('returns no-service-worker when no registration exists (avoids hanging on .ready)', async () => {
		stubBaseGlobals();
		vi.stubGlobal('navigator', {
			serviceWorker: { getRegistration: vi.fn().mockResolvedValue(null) }
		});
		const result = await subscribeToPush();
		expect(result).toEqual({ ok: false, reason: 'no-service-worker' });
	});

	it('returns permission-denied when permission is not granted', async () => {
		stubBaseGlobals('denied');
		makeRegistration();
		const result = await subscribeToPush();
		expect(result).toEqual({ ok: false, reason: 'permission-denied' });
	});

	it('reuses an existing subscription instead of calling subscribe(), then posts it', async () => {
		stubBaseGlobals();
		const reg = makeRegistration({ subscription: { ...dummySubscription } });
		stubFetch();
		const result = await subscribeToPush();
		expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
		const subscribeCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
			(c) => c[0] === '/api/push/subscribe'
		);
		expect(subscribeCall).toBeTruthy();
		expect(subscribeCall?.[1].method).toBe('POST');
		expect(result).toEqual({ ok: true });
	});

	it('returns subscribe-failed when pushManager.subscribe throws', async () => {
		stubBaseGlobals();
		makeRegistration({
			subscribeImpl: vi.fn().mockRejectedValue(new Error('Sync manager is unavailable'))
		});
		stubFetch();
		const result = await subscribeToPush();
		expect(result).toEqual({ ok: false, reason: 'subscribe-failed' });
	});

	it('returns network-error when the subscribe POST fails to reach the server', async () => {
		stubBaseGlobals();
		makeRegistration();
		stubFetch({ subscribeThrows: true });
		const result = await subscribeToPush();
		expect(result).toEqual({ ok: false, reason: 'network-error' });
	});

	it('returns server-rejected when the subscribe POST returns a non-ok status', async () => {
		stubBaseGlobals();
		makeRegistration();
		stubFetch({ subscribeStatus: 500 });
		const result = await subscribeToPush();
		expect(result).toEqual({ ok: false, reason: 'server-rejected' });
	});
});
