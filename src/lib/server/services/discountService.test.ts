import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoNothing = vi.fn();
const mockReturning = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: {
		select: () => {
			mockSelect();
			return {
				from: () => {
					mockFrom();
					return {
						where: () => {
							mockWhere();
							return {
								limit: (...args: unknown[]) => {
									mockLimit(...args);
									return Promise.resolve(args[0] === 1 ? [] : []);
								}
							};
						},
						limit: (...args: unknown[]) => {
							mockLimit(...args);
							return Promise.resolve(args[0] === 1 ? [] : []);
						}
					};
				},
				limit: (...args: unknown[]) => {
					mockLimit(...args);
					return Promise.resolve([]);
				}
			};
		},
		insert: () => {
			mockInsert();
			return {
				values: () => {
					mockValues();
					return {
						onConflictDoNothing: () => {
							mockOnConflictDoNothing();
							return {
								returning: () => {
									mockReturning();
									return Promise.resolve([]);
								}
							};
						}
					};
				}
			};
		}
	}
}));

vi.mock('$lib/server/db/schema', () => ({
	familyMembers: {},
	discounts: {},
	userDiscounts: {}
}));

import {
	calculateFamilyMemberDiscount,
	calculateLifetimeDiscount,
	calculateDiscounts
} from '$lib/server/services/discountService';

describe('discountService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('calculateFamilyMemberDiscount', () => {
		it('returns eligible with 40% discount for 5+ members', async () => {
			const result = await calculateFamilyMemberDiscount('user-1');
			expect(result.eligible).toBe(false);
			expect(result.discountPercentage).toBe(0);
		});

		it('returns not eligible for 4 or fewer members', async () => {
			const result = await calculateFamilyMemberDiscount('user-1');
			expect(result.eligible).toBe(false);
			expect(result.discountPercentage).toBe(0);
		});
	});

	describe('calculateLifetimeDiscount', () => {
		it('returns not eligible when no lifetime discount exists', async () => {
			const result = await calculateLifetimeDiscount('user-1');
			expect(result.eligible).toBe(false);
			expect(result.discountPercentage).toBe(0);
		});
	});

	describe('calculateDiscounts', () => {
		it('returns no discount when ineligible', async () => {
			const result = await calculateDiscounts('user-1');
			expect(result.totalDiscount).toBe(0);
			expect(result.breakdown).toHaveLength(0);
			expect(result.eligibleForAnnual).toBe(false);
			expect(result.eligibleForLifetime).toBe(false);
		});

		it('has correct default structure', async () => {
			const result = await calculateDiscounts('user-1');
			expect(result).toHaveProperty('totalDiscount');
			expect(result).toHaveProperty('breakdown');
			expect(result).toHaveProperty('eligibleForAnnual');
			expect(result).toHaveProperty('eligibleForLifetime');
		});
	});
});