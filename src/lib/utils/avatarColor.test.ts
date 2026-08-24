import { describe, it, expect } from 'vitest';
import { avatarColor, PALETTE } from './avatarColor';

describe('avatarColor', () => {
	it('returns the same color for the same id', () => {
		expect(avatarColor('user-123')).toBe(avatarColor('user-123'));
	});

	it('can return different colors for different ids', () => {
		const ids = Array.from({ length: 20 }, (_, i) => `user-${i}`);
		expect(new Set(ids.map(avatarColor)).size).toBeGreaterThan(1);
	});

	it('always returns a member of the palette', () => {
		const ids = Array.from({ length: 50 }, (_, i) => `member-${i}`);
		for (const id of ids) expect(PALETTE).toContain(avatarColor(id));
	});
});
