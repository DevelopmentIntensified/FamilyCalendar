import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import {
	parseServiceAccount,
	signServiceAccountJwt,
	createFcmSender,
	notificationMessage,
	eventsChangedMessage,
	getFcmSender,
	type ServiceAccount
} from './fcmService';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const RAW_ACCOUNT = {
	type: 'service_account',
	project_id: 'familyplanz-test',
	client_email: 'fcm@familyplanz-test.iam.gserviceaccount.com',
	private_key: privateKey,
	token_uri: 'https://oauth2.googleapis.com/token'
};

const SA: ServiceAccount = {
	projectId: RAW_ACCOUNT.project_id,
	clientEmail: RAW_ACCOUNT.client_email,
	privateKey,
	tokenUri: RAW_ACCOUNT.token_uri
};

function b64urlJson(part: string): unknown {
	return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/** A scripted fetch: the OAuth exchange answers with a token, sends answer per `sendReplies`. */
function scriptedFetch(sendReplies: Response[] = [], expiresIn = 3600) {
	let tokenCount = 0;
	const calls: { url: string; init: RequestInit }[] = [];
	const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
		const url = String(input);
		calls.push({ url, init });
		if (url === 'https://oauth2.googleapis.com/token') {
			tokenCount++;
			return jsonResponse(200, {
				access_token: `ya29.token-${tokenCount}`,
				expires_in: expiresIn,
				token_type: 'Bearer'
			});
		}
		return sendReplies.shift() ?? jsonResponse(200, { name: 'projects/x/messages/1' });
	});
	return { fn, calls, tokenCount: () => tokenCount };
}

describe('parseServiceAccount', () => {
	it('reads raw JSON', () => {
		expect(parseServiceAccount(JSON.stringify(RAW_ACCOUNT))).toEqual(SA);
	});

	it('reads base64-encoded JSON', () => {
		const b64 = Buffer.from(JSON.stringify(RAW_ACCOUNT)).toString('base64');
		expect(parseServiceAccount(b64)).toEqual(SA);
	});

	it('defaults token_uri to the Google OAuth endpoint', () => {
		const { token_uri: _omit, ...rest } = RAW_ACCOUNT;
		expect(parseServiceAccount(JSON.stringify(rest))?.tokenUri).toBe(
			'https://oauth2.googleapis.com/token'
		);
	});

	it.each([
		['unset', undefined],
		['empty', ''],
		['whitespace', '   '],
		['garbage', 'not-json-nor-base64!!'],
		['missing private_key', JSON.stringify({ ...RAW_ACCOUNT, private_key: undefined })],
		['missing project_id', JSON.stringify({ ...RAW_ACCOUNT, project_id: '' })]
	])('returns null when %s', (_label, raw) => {
		expect(parseServiceAccount(raw)).toBeNull();
	});

	it('unescapes \\n in a private key pasted as one line', () => {
		const oneLine = JSON.stringify({ ...RAW_ACCOUNT, private_key: privateKey.replace(/\n/g, '\\n') });
		expect(parseServiceAccount(oneLine)?.privateKey).toBe(privateKey);
	});
});

describe('signServiceAccountJwt', () => {
	it('builds an RS256 JWT with the FCM scope and a 1h lifetime, verifiable by the public key', () => {
		const jwt = signServiceAccountJwt(SA, 1_700_000_000);
		const [header, claims, signature] = jwt.split('.');

		expect(b64urlJson(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
		expect(b64urlJson(claims)).toEqual({
			iss: SA.clientEmail,
			scope: 'https://www.googleapis.com/auth/firebase.messaging',
			aud: 'https://oauth2.googleapis.com/token',
			iat: 1_700_000_000,
			exp: 1_700_003_600
		});
		const verifier = createVerify('RSA-SHA256');
		verifier.update(`${header}.${claims}`);
		expect(verifier.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
	});
});

describe('message builders', () => {
	it('notification message carries title/body and the link as data', () => {
		expect(notificationMessage({ title: 'Hi', body: 'There', link: '/calendar' })).toEqual({
			notification: { title: 'Hi', body: 'There' },
			data: { type: 'notification', link: '/calendar' },
			android: { priority: 'high' }
		});
	});

	it('notification message without link omits data.link', () => {
		expect(notificationMessage({ title: 'Hi', body: 'There' }).data).toEqual({
			type: 'notification'
		});
	});

	it('events_changed is data-only, high priority, collapsed, short TTL', () => {
		const msg = eventsChangedMessage();
		expect(msg).toEqual({
			data: { type: 'events_changed' },
			android: { priority: 'high', collapse_key: 'events_changed', ttl: '600s' }
		});
		expect(msg).not.toHaveProperty('notification');
	});
});

describe('createFcmSender', () => {
	it('exchanges the JWT for an access token and posts messages:send', async () => {
		const f = scriptedFetch();
		const sender = createFcmSender(SA, { fetch: f.fn, now: () => 1_700_000_000_000 });

		const result = await sender.send('device-token-1', eventsChangedMessage());

		expect(result).toBe('sent');
		const [tokenCall, sendCall] = f.calls;
		expect(tokenCall.url).toBe('https://oauth2.googleapis.com/token');
		expect(tokenCall.init.method).toBe('POST');
		const form = new URLSearchParams(String(tokenCall.init.body));
		expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
		expect(form.get('assertion')?.split('.')).toHaveLength(3);

		expect(sendCall.url).toBe(
			'https://fcm.googleapis.com/v1/projects/familyplanz-test/messages:send'
		);
		expect(sendCall.init.method).toBe('POST');
		const headers = new Headers(sendCall.init.headers);
		expect(headers.get('authorization')).toBe('Bearer ya29.token-1');
		expect(headers.get('content-type')).toBe('application/json');
		expect(JSON.parse(String(sendCall.init.body))).toEqual({
			message: {
				token: 'device-token-1',
				data: { type: 'events_changed' },
				android: { priority: 'high', collapse_key: 'events_changed', ttl: '600s' }
			}
		});
	});

	it('sends the notification body shape for a notification message', async () => {
		const f = scriptedFetch();
		const sender = createFcmSender(SA, { fetch: f.fn, now: () => 0 });
		await sender.send('t', notificationMessage({ title: 'A', body: 'B', link: '/x' }));
		const body = JSON.parse(String(f.calls[1].init.body));
		expect(body.message).toEqual({
			token: 't',
			notification: { title: 'A', body: 'B' },
			data: { type: 'notification', link: '/x' },
			android: { priority: 'high' }
		});
	});

	it('caches the access token until shortly before expiry', async () => {
		let nowMs = 1_700_000_000_000;
		const f = scriptedFetch([], 3600);
		const sender = createFcmSender(SA, { fetch: f.fn, now: () => nowMs });

		await sender.send('a', eventsChangedMessage());
		await sender.send('b', eventsChangedMessage());
		nowMs += 3000 * 1000; // 50 min later — still valid
		await sender.send('c', eventsChangedMessage());
		expect(f.tokenCount()).toBe(1);

		nowMs += 590 * 1000; // within the 60s refresh margin of expiry
		await sender.send('d', eventsChangedMessage());
		expect(f.tokenCount()).toBe(2);
	});

	it('shares one in-flight token exchange across parallel sends', async () => {
		const f = scriptedFetch();
		const sender = createFcmSender(SA, { fetch: f.fn, now: () => 0 });
		await Promise.all(['a', 'b', 'c'].map((t) => sender.send(t, eventsChangedMessage())));
		expect(f.tokenCount()).toBe(1);
	});

	it.each([
		['404 NOT_FOUND', jsonResponse(404, { error: { code: 404, status: 'NOT_FOUND' } })],
		[
			'UNREGISTERED errorCode',
			jsonResponse(404, {
				error: {
					status: 'NOT_FOUND',
					details: [
						{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }
					]
				}
			})
		],
		[
			'400 INVALID_ARGUMENT on the token',
			jsonResponse(400, {
				error: {
					code: 400,
					message: 'The registration token is not a valid FCM registration token',
					status: 'INVALID_ARGUMENT',
					details: [
						{
							'@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
							errorCode: 'INVALID_ARGUMENT'
						},
						{
							'@type': 'type.googleapis.com/google.rpc.BadRequest',
							fieldViolations: [{ field: 'message.token', description: 'Invalid registration token' }]
						}
					]
				}
			})
		]
	])('reports unregistered on %s', async (_label, reply) => {
		const sender = createFcmSender(SA, { fetch: scriptedFetch([reply]).fn, now: () => 0 });
		expect(await sender.send('dead', eventsChangedMessage())).toBe('unregistered');
	});

	it('a 400 INVALID_ARGUMENT not about the token is a plain failure', async () => {
		const reply = jsonResponse(400, {
			error: {
				status: 'INVALID_ARGUMENT',
				message: 'Invalid value at message.android.ttl',
				details: [
					{
						'@type': 'type.googleapis.com/google.rpc.BadRequest',
						fieldViolations: [{ field: 'message.android.ttl' }]
					}
				]
			}
		});
		const sender = createFcmSender(SA, { fetch: scriptedFetch([reply]).fn, now: () => 0 });
		expect(await sender.send('t', eventsChangedMessage())).toBe('failed');
	});

	it('5xx and network errors are failures, never throws', async () => {
		const s1 = createFcmSender(SA, {
			fetch: scriptedFetch([jsonResponse(503, { error: { status: 'UNAVAILABLE' } })]).fn,
			now: () => 0
		});
		expect(await s1.send('t', eventsChangedMessage())).toBe('failed');

		const s2 = createFcmSender(SA, {
			fetch: vi.fn(async () => {
				throw new Error('ECONNRESET');
			}),
			now: () => 0
		});
		expect(await s2.send('t', eventsChangedMessage())).toBe('failed');
	});

	it('drops the cached token after a 401 so the next send re-authenticates', async () => {
		const f = scriptedFetch([jsonResponse(401, { error: { status: 'UNAUTHENTICATED' } })]);
		const sender = createFcmSender(SA, { fetch: f.fn, now: () => 0 });
		expect(await sender.send('t', eventsChangedMessage())).toBe('failed');
		await sender.send('t', eventsChangedMessage());
		expect(f.tokenCount()).toBe(2);
	});

	it('a failed token exchange is a failure, not a throw', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(400, { error: 'invalid_grant' }));
		const sender = createFcmSender(SA, { fetch: fetchFn, now: () => 0 });
		expect(await sender.send('t', eventsChangedMessage())).toBe('failed');
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});
});

describe('getFcmSender', () => {
	it('returns null when FCM_SERVICE_ACCOUNT_JSON is unset (skip silently)', () => {
		expect(getFcmSender({})).toBeNull();
	});

	it('memoizes one sender per configured value (token cache survives across calls)', () => {
		const env = { FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(RAW_ACCOUNT) };
		const a = getFcmSender(env);
		expect(a).not.toBeNull();
		expect(getFcmSender(env)).toBe(a);
	});
});
