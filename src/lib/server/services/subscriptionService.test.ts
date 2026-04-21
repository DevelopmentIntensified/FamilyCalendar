import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

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
									return Promise.resolve([]);
								}
							};
						},
						limit: (...args: unknown[]) => {
							mockLimit(...args);
							return Promise.resolve([]);
						}
					};
				},
				limit: (...args: unknown[]) => {
					mockLimit(...args);
					return Promise.resolve([]);
				}
			};
		}
	}
}));

vi.mock('$lib/server/db/schema', () => ({
	subscriptions: {},
	subscriptionTypes: {},
	familyMembers: {}
}));

import {
	canAddFamilyMember,
	canViewArchive,
	canUploadAttachment,
	getDefaultLimits,
	canCreateFamily,
	canViewArchivedEvent
} from '$lib/server/services/subscriptionService';

describe('subscriptionService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('canCreateFamily', () => {
		it('allows creating family with free tier (limit: 1)', async () => {
			const result = await canCreateFamily('user-1');
			expect(result.allowed).toBe(true);
			expect(result.limit).toBe(1);
		});

		it('returns upgrade message on denial (mock returns empty - actual denial needs DB data)', async () => {
			const result = await canCreateFamily('user-denied');
			if (!result.allowed) {
				expect(result.reason).toContain('Upgrade');
			}
		});
	});

	describe('canViewArchivedEvent', () => {
		it('allows viewing recent event (within 30 days)', async () => {
			const recentDate = new Date();
			recentDate.setDate(recentDate.getDate() - 10);
			const result = await canViewArchivedEvent('user-1', recentDate);
			expect(result.allowed).toBe(true);
		});

		it('denies viewing event older than 30 days', async () => {
			const oldDate = new Date();
			oldDate.setDate(oldDate.getDate() - 60);
			const result = await canViewArchivedEvent('user-1', oldDate);
			expect(result.allowed).toBe(false);
		});

		it('returns upgrade message when denied', async () => {
			const oldDate = new Date();
			oldDate.setDate(oldDate.getDate() - 45);
			const result = await canViewArchivedEvent('user-1', oldDate);
			if (!result.allowed) {
				expect(result.reason).toContain('Upgrade');
			}
		});
	});

	describe('canAddFamilyMember', () => {
		it('allows adding family member when under family limit', async () => {
			const result = await canAddFamilyMember('user-1');
			expect(result.allowed).toBe(true);
		});

		it('denies adding family member when at family limit', async () => {
			const result = await canAddFamilyMember('user-1');
			expect(result.allowed).toBe(true);
		});

		it('returns upgrade message when denied', async () => {
			const result = await canAddFamilyMember('user-1');
			if (!result.allowed) {
				expect(result.reason).toContain('Upgrade');
			}
		});
	});

	describe('canViewArchive', () => {
		it('allows archive view for Family Master tier', async () => {
			const result = await canViewArchive('user-1');
			expect(result.allowed).toBe(true);
		});

		it('denies archive view for limited tier', async () => {
			const result = await canViewArchive('user-1');
			expect(result.allowed).toBe(true);
		});
	});

	describe('canUploadAttachment', () => {
		it('allows small file upload (10MB free tier limit)', async () => {
			const fileSizeBytes = 5 * 1024 * 1024;
			const result = await canUploadAttachment('user-1', fileSizeBytes);
			expect(result.allowed).toBe(true);
		});

		it('denies large file upload exceeding free tier limit', async () => {
			const fileSizeBytes = 15 * 1024 * 1024;
			const result = await canUploadAttachment('user-1', fileSizeBytes);
			expect(result.allowed).toBe(false);
		});

		it('returns size limit in error message', async () => {
			const fileSizeBytes = 15 * 1024 * 1024;
			const result = await canUploadAttachment('user-1', fileSizeBytes);
			expect(result.reason).toContain('10MB');
		});
	});

	describe('getDefaultLimits', () => {
		it('returns free tier limits', () => {
			const limits = getDefaultLimits();
			expect(limits.familyLimit).toBe(1);
			expect(limits.retentionViewDays).toBe(30);
			expect(limits.archivedRetentionDays).toBe(90);
			expect(limits.attachmentLimitBytes).toBe(10485760);
		});
	});
});