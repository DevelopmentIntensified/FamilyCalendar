/**
 * Pure token rules: the `fp_` prefix and its format guard, the plaintext
 * encoding of the 32 random bytes, and the name cut. Hashing is kernel
 * `sha256Hex` (pinned byte-identical to legacy `hashApiToken` in
 * `ids.test.ts`). Expected values come from `apiTokens.ts`,
 * `apiTokens.test.ts`, `accountData.ts` and the golden, and the encodings are
 * worked by hand.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	API_TOKEN_BYTES,
	API_TOKEN_NAME_MAX,
	API_TOKEN_PREFIX,
	apiTokenName,
	apiTokenPlaintext,
	isApiTokenFormat
} from './identity.token.rules';

const FORMAT = /^fp_[A-Za-z0-9_-]{43}$/;

describe('apiTokenPlaintext', () => {
	it('mints fp_ followed by 43 base64url characters (32 random bytes)', () => {
		expect([API_TOKEN_PREFIX, API_TOKEN_BYTES]).toEqual(['fp_', 32]);
		const token = apiTokenPlaintext(new Uint8Array(API_TOKEN_BYTES).fill(0x5a));
		expect(token).toMatch(FORMAT);
		expect(token).toHaveLength(46);
	});

	// 32 zero bytes = 256 zero bits: 43 base64url digits of value 0 ('A').
	it('encodes 32 zero bytes as 43 "A"s, no padding', () => {
		const token = apiTokenPlaintext(new Uint8Array(32));
		expect(token).toBe(`fp_${'A'.repeat(43)}`);
		expect(token).toMatch(FORMAT);
	});

	// 32 0xFF bytes: 42 full digits of 63 ('_' in base64url, not '/'), then
	// the last 4 bits 1111 padded to 111100 = 60 = '8'.
	it('uses the url-safe alphabet: 32 0xFF bytes', () => {
		const token = apiTokenPlaintext(new Uint8Array(32).fill(0xff));
		expect(token).toBe(`fp_${'_'.repeat(42)}8`);
		expect(token).toMatch(FORMAT);
	});

	// 0xFB 0xFF 0xBF = 111110 111111 111110 111111 → digits 62 63 62 63:
	// standard base64 '+/+/', base64url '-_-_'.
	it('turns + and / into - and _', () => {
		const bytes = new Uint8Array(32);
		bytes.set([0xfb, 0xff, 0xbf]);
		expect(apiTokenPlaintext(bytes).slice(0, 7)).toBe('fp_-_-_');
	});
});

describe('isApiTokenFormat', () => {
	// apiTokens.ts:83 and apiTokens.test.ts:96-103: anything without the
	// prefix is refused before any lookup.
	it.each<[string, boolean]>([
		[`fp_${'A'.repeat(43)}`, true],
		['fp_validtoken', true],
		['not-a-token', false],
		['', false],
		['FP_upper', false],
		[' fp_leading-space', false]
	])('%j → %s', (token, expected) => {
		expect(isApiTokenFormat(token)).toBe(expected);
	});
});

describe('apiTokenName', () => {
	it('caps at 60', () => {
		expect(API_TOKEN_NAME_MAX).toBe(60);
	});

	// Q-109 B: cut at 60 CODE POINTS, then trim (accountData.ts:429-443 had
	// `name.trim().slice(0, 60)` on UTF-16 units).
	it.each<[string, string, string]>([
		['trims both ends', '  My phone  ', 'My phone'],
		['keeps a short name', 'Phone', 'Phone'],
		['keeps 60 characters', 'x'.repeat(60), 'x'.repeat(60)],
		['cuts at 60', 'x'.repeat(70), 'x'.repeat(60)],
		['keeps an emoji straddling unit 60 whole', `${'a'.repeat(59)}😀tail`, `${'a'.repeat(59)}😀`],
		['trims the whitespace the cut leaves', `${'w'.repeat(58)}   more`, `${'w'.repeat(58)}`],
		['cuts before trimming, so leading spaces eat into the cap', `  ${'a'.repeat(60)}`, 'a'.repeat(58)],
		['is empty for a blank name', '   ', '']
	])('%s', (_label, raw, expected) => {
		expect(apiTokenName(raw)).toBe(expected);
	});
});
