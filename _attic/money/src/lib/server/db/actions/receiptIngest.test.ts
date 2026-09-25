import { describe, it, expect } from 'vitest';
import { generateIngestToken, isValidIngestToken, INGEST_TOKEN_LENGTH } from './receiptIngest';

describe('generateIngestToken', () => {
	it('produces 32-char lowercase hex tokens', () => {
		for (let i = 0; i < 20; i++) {
			const token = generateIngestToken();
			expect(token).toHaveLength(INGEST_TOKEN_LENGTH);
			expect(isValidIngestToken(token)).toBe(true);
		}
	});

	it('produces unique tokens', () => {
		const tokens = new Set(Array.from({ length: 100 }, () => generateIngestToken()));
		expect(tokens.size).toBe(100);
	});
});

describe('isValidIngestToken', () => {
	it('rejects malformed tokens', () => {
		expect(isValidIngestToken('')).toBe(false);
		expect(isValidIngestToken('g'.repeat(32))).toBe(false);
		expect(isValidIngestToken('abc')).toBe(false);
		expect(isValidIngestToken('a'.repeat(31))).toBe(false);
		expect(isValidIngestToken('a'.repeat(33))).toBe(false);
		expect(isValidIngestToken("a'.repeat(32)'; DROP TABLE users;--")).toBe(false);
	});
});
