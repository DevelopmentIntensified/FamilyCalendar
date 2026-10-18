import { generateRandomString } from '@oslojs/crypto/random';

/**
 * The repo's row-id generator — byte-for-byte the same generator lucia used
 * (same alphabet, same @oslojs/crypto random), extracted as #196's prep step
 * so `schema.ts` and every row-creating action stop importing lucia for ids.
 *
 * Callers pass the length explicitly (rows use 15, invite codes use 10).
 * Existing id values keep their format; this only generates new ones.
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const random = {
	read(bytes: Uint8Array) {
		crypto.getRandomValues(bytes);
	}
};

export function generateId(length: number): string {
	return generateRandomString(random, ALPHABET, length);
}
