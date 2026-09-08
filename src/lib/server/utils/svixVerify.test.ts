import { describe, it, expect } from 'vitest';
import { verifySvixSignature, svixSignature } from './svixVerify';

/**
 * Precomputed fixture vector (node crypto):
 *   signed = `msg_test_fixture.1725000000.` + payload
 *   HMAC-SHA256('whsec_test_secret', signed) → base64
 */
const SECRET = 'whsec_test_secret';
const PAYLOAD = JSON.stringify({ type: 'email.received' });
const HEADERS = {
	id: 'msg_test_fixture',
	timestamp: '1725000000',
	signature: '/j6gf0iMIstbUcCeHzASzSInky0putTmzF5HsneqowQ='
};

/** Resend sends lowercase svix-* headers; pass them as a plain record. */
function headers(over: Partial<typeof HEADERS> = {}) {
	return {
		'svix-id': over.id ?? HEADERS.id,
		'svix-timestamp': over.timestamp ?? HEADERS.timestamp,
		'svix-signature': over.signature ?? HEADERS.signature
	};
}

describe('verifySvixSignature', () => {
	it('accepts a valid fixture signature', () => {
		expect(verifySvixSignature(headers(), PAYLOAD, SECRET, 1725000000)).toBe(true);
	});

	it('accepts any signature in the space-separated list', () => {
		const multi = headers({
			signature: `v1badbadbadbadbadbadbadbadbadbadbadbadbadbad= ${HEADERS.signature}`
		});
		expect(verifySvixSignature(multi, PAYLOAD, SECRET, 1725000000)).toBe(true);
	});

	it('accepts signatures computed by the symmetric helper', () => {
		const sig = svixSignature('msg_x', '1725000100', '{"a":1}', SECRET);
		expect(
			verifySvixSignature(
				{ 'svix-id': 'msg_x', 'svix-timestamp': '1725000100', 'svix-signature': sig },
				'{"a":1}',
				SECRET,
				1725000100
			)
		).toBe(true);
	});

	it('rejects a tampered payload', () => {
		expect(
			verifySvixSignature(headers(), PAYLOAD.replace('email', 'evil'), SECRET, 1725000000)
		).toBe(false);
	});

	it('rejects a wrong secret', () => {
		expect(verifySvixSignature(headers(), PAYLOAD, 'whsec_other', 1725000000)).toBe(false);
	});

	it('rejects a missing id, timestamp, or signature', () => {
		expect(verifySvixSignature(headers({ id: '' }), PAYLOAD, SECRET, 1725000000)).toBe(false);
		expect(verifySvixSignature(headers({ timestamp: '' }), PAYLOAD, SECRET, 1725000000)).toBe(
			false
		);
		expect(verifySvixSignature(headers({ signature: '' }), PAYLOAD, SECRET, 1725000000)).toBe(
			false
		);
	});

	it('rejects non-numeric timestamps', () => {
		expect(
			verifySvixSignature(headers({ timestamp: 'yesterday' }), PAYLOAD, SECRET, 1725000000)
		).toBe(false);
	});

	it('rejects timestamps outside the 5-minute tolerance', () => {
		const late = 1725000000 + 301;
		const early = 1725000000 - 301;
		expect(verifySvixSignature(headers(), PAYLOAD, SECRET, late)).toBe(false);
		expect(verifySvixSignature(headers(), PAYLOAD, SECRET, early)).toBe(false);
		// Inside tolerance (±300s) still passes.
		expect(verifySvixSignature(headers(), PAYLOAD, SECRET, 1725000000 + 300)).toBe(true);
	});
});
