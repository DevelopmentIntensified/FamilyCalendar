import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Manual Svix webhook signature verification (Resend `email.received`
 * webhooks, #033). Resend signs with the Svix scheme — no `svix` package
 * needed: the signature is base64(HMAC-SHA256(secret, `${id}.${timestamp}.
 * ${payload}`)) sent in the `svix-signature` header as a space-separated
 * candidate list, alongside `svix-id` and `svix-timestamp`.
 */

/** Svix default replay tolerance: 5 minutes each way. */
export const SVIX_TOLERANCE_SECONDS = 300;

/** Header names Resend/Svix set on webhook POSTs. */
export const SVIX_HEADERS = {
	id: 'svix-id',
	timestamp: 'svix-timestamp',
	signature: 'svix-signature'
} as const;

/** Minimal header carrier: a Request's Headers or a plain record. */
export type SvixHeaders = Headers | Record<string, string>;

/** Reads a header from either carrier, case-insensitively. */
function readHeader(headers: SvixHeaders, name: string): string | null {
	if (headers instanceof Headers) return headers.get(name);
	return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

/** The HMAC for one (id, timestamp, payload) triple — also used by tests. */
export function svixSignature(id: string, timestamp: string, payload: string, secret: string) {
	return createHmac('sha256', secret).update(`${id}.${timestamp}.${payload}`).digest('base64');
}

/** Constant-time string equality over equal-length byte sequences. */
function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a, 'utf8');
	const bb = Buffer.from(b, 'utf8');
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Verifies a raw webhook body against its Svix headers. `nowSeconds`
 * defaults to the current wall clock; tests pass a fixed instant. Returns
 * false on ANY missing/malformed input — callers respond 400 without
 * leaking which check failed.
 */
export function verifySvixSignature(
	headers: SvixHeaders,
	payload: string,
	secret: string,
	nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
	const id = readHeader(headers, SVIX_HEADERS.id);
	const timestamp = readHeader(headers, SVIX_HEADERS.timestamp);
	const signatureHeader = readHeader(headers, SVIX_HEADERS.signature);
	if (!id || !timestamp || !signatureHeader) return false;
	if (!/^\d+$/.test(timestamp)) return false;

	const age = nowSeconds - Number(timestamp);
	if (Math.abs(age) > SVIX_TOLERANCE_SECONDS) return false;

	const expected = svixSignature(id, timestamp, payload, secret);
	// SAFETY: the candidate list is attacker-controlled text split on
	// spaces; only string equality against the HMAC is ever derived from it.
	return signatureHeader.split(' ').some((candidate) => safeEqual(candidate, expected));
}
