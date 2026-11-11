import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ROW_ID_LENGTH, sequentialIds, sha256Hex, systemIds } from './ids';

describe('systemIds', () => {
	it('keeps the existing row-id format: 15 chars of a-z0-9', () => {
		const id = systemIds.id();
		expect(id).toHaveLength(ROW_ID_LENGTH);
		expect(id).toMatch(/^[a-z0-9]{15}$/);
	});

	it('honours an explicit length (invite codes use 10)', () => {
		expect(systemIds.id(10)).toMatch(/^[a-z0-9]{10}$/);
	});
});

describe('sequentialIds', () => {
	it('counts up per instance', () => {
		const ids = sequentialIds('task');
		expect([ids.id(), ids.id()]).toEqual(['task-1', 'task-2']);
		expect(sequentialIds().id()).toBe('id-1');
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
