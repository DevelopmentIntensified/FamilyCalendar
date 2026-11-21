import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hmacSha256Hex, ROW_ID_LENGTH, sequentialIds, sha256Hex, systemIds } from './ids';

describe('systemIds', () => {
	it('keeps the existing row-id format: 15 chars of a-z0-9', () => {
		const id = systemIds.id();
		expect(id).toHaveLength(ROW_ID_LENGTH);
		expect(id).toMatch(/^[a-z0-9]{15}$/);
	});

	it('honours an explicit length (invite codes use 10)', () => {
		expect(systemIds.id(10)).toMatch(/^[a-z0-9]{10}$/);
	});

	it('draws the requested number of random bytes', () => {
		expect(systemIds.random(32)).toHaveLength(32);
		expect(systemIds.random(0)).toHaveLength(0);
		// Two 256-bit draws colliding is a 2^-256 event, like the row ids above.
		expect(systemIds.random(32)).not.toEqual(systemIds.random(32));
	});
});

describe('sequentialIds', () => {
	it('counts up per instance', () => {
		const ids = sequentialIds('task');
		expect([ids.id(), ids.id()]).toEqual(['task-1', 'task-2']);
		expect(sequentialIds().id()).toBe('id-1');
	});

	it('draws bytes from their own counter, so a draw never renumbers a row id', () => {
		const ids = sequentialIds();
		expect([...ids.random(4)]).toEqual([0, 1, 2, 3]);
		expect([...ids.random(2)]).toEqual([4, 5]);
		expect(ids.id()).toBe('id-1');
	});
});

describe('sha256Hex', () => {
	it('matches the FIPS 180-2 test vector', () => {
		expect(sha256Hex('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});

	it('hashes UTF-8 bytes exactly like the legacy node:crypto copies did', () => {
		for (const text of ['fp_abc', 'é', '123456', 'Family Planz 👪']) {
			expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
		}
	});
});

describe('hmacSha256Hex', () => {
	// RFC 4231 §4.2/4.3, HMAC-SHA-256. Expected hex is the RFC's, not this
	// code's output. Case 1's key is twenty 0x0b bytes; every byte is ASCII, so
	// its UTF-8 string form is the same twenty bytes. Byte vectors whose key or
	// data is >= 0x80 (cases 3-7) have no plain UTF-8 string form here.
	it.each<[string, string, string, string]>([
		[
			'case 1 — key 0x0b x20, data "Hi There"',
			'\x0b'.repeat(20),
			'Hi There',
			'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
		],
		[
			'case 2 — key "Jefe", data "what do ya want for nothing?"',
			'Jefe',
			'what do ya want for nothing?',
			'5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
		]
	])('matches RFC 4231 %s', (_label, key, text, expected) => {
		expect(hmacSha256Hex(key, text)).toBe(expected);
	});

	it('hashes UTF-8 bytes of key and text exactly like node:crypto', () => {
		for (const [key, text] of [
			['test-code-pepper', '24681357'],
			['pépper', 'é'],
			['Family Planz 👪', '123456']
		] as const) {
			expect(hmacSha256Hex(key, text)).toBe(
				createHmac('sha256', key).update(text, 'utf8').digest('hex')
			);
		}
	});

	it('answers a keyed digest, never the bare SHA-256 of the text', () => {
		expect(hmacSha256Hex('pepper-a', '24681357')).not.toBe(sha256Hex('24681357'));
		expect(hmacSha256Hex('pepper-a', '24681357')).not.toBe(hmacSha256Hex('pepper-b', '24681357'));
	});
});
