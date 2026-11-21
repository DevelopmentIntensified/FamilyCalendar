/**
 * Ids port + the one SHA-256 helper.
 *
 * `systemIds.id()` produces the same format every existing row uses (15 chars,
 * a-z0-9, same generator lucia used — see legacy `generateId`). Tests use
 * `sequentialIds()` so inserted ids are predictable (`id-1`, `id-2`, ...).
 *
 * `sha256Hex` is THE hash for stored secrets (API tokens, email codes, claim
 * tokens): lowercase hex of SHA-256 over UTF-8, byte-identical to the legacy
 * `hashApiToken` / `hashEmailCode` copies it replaces.
 *
 * Doc: src/lib/kernel/README.md#ids
 */
import { generateRandomString } from '@oslojs/crypto/random';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';

export const ROW_ID_LENGTH = 15;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export type Ids = {
	/** A new random id; `length` defaults to the row-id length (15). */
	id(length?: number): string;
	/** `count` cryptographically random bytes (tokens, codes, claim links). */
	random(count: number): Uint8Array;
};

const random = {
	read(bytes: Uint8Array) {
		crypto.getRandomValues(bytes);
	}
};

function randomBytes(count: number): Uint8Array {
	const bytes = new Uint8Array(count);
	crypto.getRandomValues(bytes);
	return bytes;
}

export const systemIds: Ids = {
	id: (length = ROW_ID_LENGTH) => generateRandomString(random, ALPHABET, length),
	random: randomBytes
};

/**
 * Deterministic ids for tests: `${prefix}-1`, `${prefix}-2`, ... Random bytes
 * count up from 0 (mod 256) on their own counter, so drawing bytes never
 * renumbers a row id.
 */
export function sequentialIds(prefix = 'id'): Ids {
	let n = 0;
	let next = 0;
	return {
		id: () => `${prefix}-${++n}`,
		random: (count) => {
			const bytes = new Uint8Array(count);
			for (let i = 0; i < count; i++) bytes[i] = next++ & 0xff;
			return bytes;
		}
	};
}

export function sha256Hex(text: string): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(text)));
}
