/**
 * The email predicate on its own: the legacy auth-flow regex, moved out of
 * `validators.ts` so a browser rules file can ask it without zod (ADR 0010).
 * The zod schema built on it is covered by `validators.test.ts`.
 *
 * Doc: src/lib/kernel/README.md#validation
 */
import { describe, expect, it } from 'vitest';
import { isEmailAddress } from './primitives';

describe('isEmailAddress', () => {
	it.each([
		['ann@example.com', true],
		['first.last+tag@sub.example.co.uk', true],
		['a@b.io', true],
		['  ann@example.com  ', false],
		['ann@example', false],
		['ann.example.com', false],
		['@example.com', false],
		['ann@', false],
		['', false]
	])('%j → %s', (value, expected) => {
		expect(isEmailAddress(value)).toBe(expected);
	});
});
