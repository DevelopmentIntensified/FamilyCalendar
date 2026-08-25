import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { toIsoTimestamp } from './taskStats';

describe('toIsoTimestamp', () => {
	it('normalizes Postgres timestamptz strings (space separator) to ISO', () => {
		// pg returns 'YYYY-MM-DD HH:mm:ss+00' — DateTime.fromISO chokes on the space.
		const result = toIsoTimestamp('2026-08-25 10:00:00+00');
		expect(result).toBe('2026-08-25T10:00:00.000Z');
		// The whole point: the client must be able to DateTime.fromISO it.
		expect(DateTime.fromISO(result).isValid).toBe(true);
	});

	it('passes already-ISO timestamps through', () => {
		expect(toIsoTimestamp('2026-08-25T10:00:00Z')).toBe('2026-08-25T10:00:00.000Z');
	});

	it('maps null to empty string', () => {
		expect(toIsoTimestamp(null)).toBe('');
	});

	it('maps unparseable values to empty string instead of throwing', () => {
		expect(toIsoTimestamp('not a date')).toBe('');
	});
});
