import { describe, it, expect } from 'vitest';
import { resolveMasterId } from './eventIds';

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
