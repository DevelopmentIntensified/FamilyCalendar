import { createSign } from 'node:crypto';

/**
 * Firebase Cloud Messaging HTTP v1 transport (#272). No SDK: the service
 * account signs an RS256 JWT with node:crypto, Google's OAuth endpoint trades
 * it for a 1h access token (cached per sender until shortly before expiry),
 * and each message is one POST to `messages:send`.
 *
 * Pure transport — no database. Token pruning is the caller's job, driven by
 * the `'unregistered'` result.
 */

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
/** Refresh this long before the access token's stated expiry. */
const REFRESH_MARGIN_MS = 60_000;

export interface ServiceAccount {
	projectId: string;
	clientEmail: string;
	privateKey: string;
	tokenUri: string;
}

function str(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(text);
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/**
 * Reads `FCM_SERVICE_ACCOUNT_JSON`: the downloaded service-account key, either
 * raw JSON or base64 of it (Vercel env values survive either). Null when unset
 * or unusable — callers treat that as "FCM not configured" and skip.
 */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
	const text = raw?.trim();
	if (!text) return null;
	const obj = text.startsWith('{')
		? parseJsonObject(text)
		: parseJsonObject(Buffer.from(text, 'base64').toString('utf8'));
	if (!obj) return null;
	const projectId = str(obj.project_id);
	const clientEmail = str(obj.client_email);
	const privateKey = str(obj.private_key);
	if (!projectId || !clientEmail || !privateKey) return null;
	return {
		projectId,
		clientEmail,
		// A key pasted through a one-line env editor arrives with literal \n.
		privateKey: privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey,
		tokenUri: str(obj.token_uri) ?? GOOGLE_TOKEN_URI
	};
}

function b64url(value: string | Buffer): string {
	return Buffer.from(value).toString('base64url');
}

/** The OAuth assertion: RS256 JWT, FCM scope, 1h lifetime from `nowSec`. */
export function signServiceAccountJwt(sa: ServiceAccount, nowSec: number): string {
	const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const claims = b64url(
		JSON.stringify({
			iss: sa.clientEmail,
			scope: FCM_SCOPE,
			aud: sa.tokenUri,
			iat: nowSec,
			exp: nowSec + 3600
		})
	);
	const signer = createSign('RSA-SHA256');
	signer.update(`${header}.${claims}`);
	return `${header}.${claims}.${b64url(signer.sign(sa.privateKey))}`;
}

/** The `message` body minus `token` (FCM v1 has no multicast; one send per token). */
export interface FcmMessage {
	notification?: { title: string; body: string };
	/** FCM requires every data value to be a string. */
	data?: Record<string, string>;
	android?: { priority?: 'high' | 'normal'; collapse_key?: string; ttl?: string };
}

/** A user-visible notification: shown by the system tray; `data.link` is the tap target. */
export function notificationMessage(payload: {
	title: string;
	body: string;
	link?: string;
}): FcmMessage {
	const data: Record<string, string> = { type: 'notification' };
	if (payload.link) data.link = payload.link;
	return {
		notification: { title: payload.title, body: payload.body },
		data,
		android: { priority: 'high' }
	};
}

/**
 * The silent sync nudge: data-only (no notification block, so nothing shows),
 * high priority so a dozing phone wakes to reschedule reminders, collapsed so a
 * burst of edits delivers once, short TTL because a stale nudge is worthless.
 */
export function eventsChangedMessage(): FcmMessage {
	return {
		data: { type: 'events_changed' },
		android: { priority: 'high', collapse_key: 'events_changed', ttl: '600s' }
	};
}

export type FcmSendResult = 'sent' | 'unregistered' | 'failed';

export interface FcmSender {
	send(token: string, message: FcmMessage): Promise<FcmSendResult>;
}

export interface FcmSenderDeps {
	fetch: typeof fetch;
	now: () => number;
}

interface FcmErrorBody {
	error?: {
		status?: string;
		message?: string;
		details?: { errorCode?: string; fieldViolations?: { field?: string }[] }[];
	};
}

/**
 * Whether an FCM error means the token itself is dead: 404 / UNREGISTERED, or
 * a 400 INVALID_ARGUMENT that names the token (a malformed payload is also
 * INVALID_ARGUMENT and must not cost the user their device).
 */
function isDeadToken(status: number, body: FcmErrorBody): boolean {
	const err = body.error;
	const details = err?.details ?? [];
	if (status === 404) return true;
	if (details.some((d) => d.errorCode === 'UNREGISTERED')) return true;
	if (status === 400 && err?.status === 'INVALID_ARGUMENT') {
		const namesToken = details.some((d) =>
			(d.fieldViolations ?? []).some((v) => v.field === 'message.token')
		);
		return namesToken || /registration token/i.test(err.message ?? '');
	}
	return false;
}

export function createFcmSender(
	sa: ServiceAccount,
	deps: FcmSenderDeps = { fetch: (...args) => fetch(...args), now: Date.now }
): FcmSender {
	let cached: { token: string; expiresAt: number } | null = null;
	let inflight: Promise<string> | null = null;

	async function exchange(): Promise<string> {
		const assertion = signServiceAccountJwt(sa, Math.floor(deps.now() / 1000));
		const res = await deps.fetch(sa.tokenUri, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
				assertion
			}).toString()
		});
		if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status}`);
		const body: { access_token?: unknown; expires_in?: unknown } = await res.json();
		if (typeof body.access_token !== 'string') throw new Error('FCM token exchange: no token');
		const ttlSec = typeof body.expires_in === 'number' ? body.expires_in : 3600;
		cached = {
			token: body.access_token,
			expiresAt: deps.now() + ttlSec * 1000 - REFRESH_MARGIN_MS
		};
		return body.access_token;
	}

	async function accessToken(): Promise<string> {
		if (cached && deps.now() < cached.expiresAt) return cached.token;
		// Parallel sends share one exchange instead of stampeding the endpoint.
		inflight ??= exchange().finally(() => {
			inflight = null;
		});
		return inflight;
	}

	return {
		async send(token, message) {
			try {
				const bearer = await accessToken();
				const res = await deps.fetch(
					`https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`,
					{
						method: 'POST',
						headers: {
							authorization: `Bearer ${bearer}`,
							'content-type': 'application/json'
						},
						body: JSON.stringify({ message: { token, ...message } })
					}
				);
				if (res.ok) return 'sent';
				if (res.status === 401) cached = null;
				const body: FcmErrorBody = await res.json().catch(() => ({}));
				if (isDeadToken(res.status, body)) return 'unregistered';
				console.error('FCM send failed:', res.status, body.error?.status ?? '');
				return 'failed';
			} catch (error) {
				console.error('FCM send error:', error);
				return 'failed';
			}
		}
	};
}

let memo: { raw: string; sender: FcmSender } | null = null;

/**
 * The process-wide sender for the configured service account, or null when
 * `FCM_SERVICE_ACCOUNT_JSON` is unset/invalid (skip silently, like VAPID).
 * Memoized per env value so the access-token cache survives across requests
 * on a warm instance.
 */
export function getFcmSender(
	env: Record<string, string | undefined> = process.env
): FcmSender | null {
	const raw = env.FCM_SERVICE_ACCOUNT_JSON;
	if (!raw) return null;
	if (memo?.raw === raw) return memo.sender;
	const sa = parseServiceAccount(raw);
	if (!sa) return null;
	memo = { raw, sender: createFcmSender(sa) };
	return memo.sender;
}

/** Cheap synchronous gate for request paths: is FCM configured at all? */
export function isFcmConfigured(env: Record<string, string | undefined> = process.env): boolean {
	return getFcmSender(env) !== null;
}
