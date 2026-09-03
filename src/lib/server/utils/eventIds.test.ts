import { describe, it, expect } from 'vitest';
import { buildOccurrenceId, resolveMasterId, resolveOccurrenceId, normalizeOccurrenceIso } from './eventIds';
import { expandRecurrence } from '$lib/server/services/recurrenceService';

describe('buildOccurrenceId', () => {
	it('joins master id and occurrence ISO with a tilde', () => {
		expect(buildOccurrenceId('abc123def456ghi', '2026-08-21T16:00:00.000Z')).toBe(
			'abc123def456ghi~2026-08-21T16:00:00.000Z'
		);
	});
});

describe('resolveMasterId', () => {
	it('splits composite occurrence ids', () => {
		expect(resolveMasterId('abc123def456ghi~2026-08-21T16:00:00.000Z')).toBe('abc123def456ghi');
	});

	it('passes plain master ids through', () => {
		expect(resolveMasterId('abc123def456ghi')).toBe('abc123def456ghi');
	});

	it('accepts uuid-shaped ids', () => {
		expect(resolveMasterId('a1b2c3d4-e5f6-7890-abcd-ef0123456789')).toBe(
			'a1b2c3d4-e5f6-7890-abcd-ef0123456789'
		);
	});

	it('accepts the selected-occurrence shape used by month chips', () => {
		const id = 'Kx7Pq2Zr9VmT1Lw~2026-08-22T05:00:00.000+02:00';
		expect(resolveMasterId(id)).toBe('Kx7Pq2Zr9VmT1Lw');
	});

	it('rejects empties and injection-y junk', () => {
		expect(resolveMasterId('')).toBeNull();
		expect(resolveMasterId('~2026-08-21')).toBeNull();
		expect(resolveMasterId("abc'; DROP TABLE events;--~x")).toBeNull();
		expect(resolveMasterId(undefined)).toBeNull();
		expect(resolveMasterId(null)).toBeNull();
	});
});

describe('resolveOccurrenceId', () => {
	it('round-trips a composite id exactly, preserving ISO precision', () => {
		const master = 'abc123def456ghi';
		const iso = '2026-08-21T16:00:00.123Z';
		const resolved = resolveOccurrenceId(buildOccurrenceId(master, iso));
		expect(resolved).toEqual({ masterId: master, occurrenceIso: iso });
	});

	it('round-trips with zero-millisecond ISO precision', () => {
		const master = 'Kx7Pq2Zr9VmT1Lw';
		const iso = '2026-08-22T05:00:00.000Z';
		const resolved = resolveOccurrenceId(buildOccurrenceId(master, iso));
		expect(resolved).toEqual({ masterId: master, occurrenceIso: iso });
	});

	it('resolves a non-recurring id (no tilde) with no occurrence', () => {
		expect(resolveOccurrenceId('abc123def456ghi')).toEqual({ masterId: 'abc123def456ghi' });
	});

	it('normalizes an offset occurrence into UTC ISO, matching construction format', () => {
		const resolved = resolveOccurrenceId('Kx7Pq2Zr9VmT1Lw~2026-08-22T05:00:00.000+02:00');
		expect(resolved).toEqual({ masterId: 'Kx7Pq2Zr9VmT1Lw', occurrenceIso: '2026-08-22T03:00:00.000Z' });
	});

	it('returns null for malformed ids', () => {
		expect(resolveOccurrenceId('')).toBeNull();
		expect(resolveOccurrenceId('~2026-08-21T00:00:00.000Z')).toBeNull();
		expect(resolveOccurrenceId("abc'; DROP TABLE events;--~2026-08-21T00:00:00.000Z")).toBeNull();
		expect(resolveOccurrenceId(undefined)).toBeNull();
		expect(resolveOccurrenceId(null)).toBeNull();
	});

	it('returns null when the occurrence part is not a parseable ISO timestamp', () => {
		expect(resolveOccurrenceId('abc123def456ghi~not-an-iso')).toBeNull();
		expect(resolveOccurrenceId('abc123def456ghi~')).toBeNull();
	});
});

describe('normalizeOccurrenceIso', () => {
	it('matches the UTC ISO output of expandRecurrence so override keying cannot drift', () => {
		const event = {
			id: 'abc123def456ghi',
			start: '2026-08-22T05:00:00.000Z',
			end: null,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1
		};
		const start = new Date('2026-08-01T00:00:00.000Z');
		const end = new Date('2026-09-01T00:00:00.000Z');
		const occs = expandRecurrence(event, start, end);
		expect(occs.length).toBeGreaterThan(0);

		for (const occ of occs) {
			// The recurrence yields Date instances; both `.toISOString()` and our
			// normalizer must render the identical UTC ISO string.
			expect(normalizeOccurrenceIso(occ.toISOString())).toBe(occ.toISOString());
			expect(normalizeOccurrenceIso(occ)).toBe(occ.toISOString());
		}
	});

	it('renders an offset timestamp in UTC ISO form', () => {
		expect(normalizeOccurrenceIso('2026-08-22T05:00:00.000+02:00')).toBe('2026-08-22T03:00:00.000Z');
	});

	it('returns null for unparseable input', () => {
		expect(normalizeOccurrenceIso('garbage')).toBeNull();
		expect(normalizeOccurrenceIso('')).toBeNull();
		expect(normalizeOccurrenceIso(undefined)).toBeNull();
		expect(normalizeOccurrenceIso(null)).toBeNull();
	});
});
