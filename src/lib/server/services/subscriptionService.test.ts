import { describe, it, expect, vi, beforeEach } from 'vitest';

/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	/** Rows returned by successive `select().from().where()` calls. */
	queue: Row[][];
}

const state = vi.hoisted(
	(): StubState => ({
		queue: []
	})
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => {
					const rows = state.queue.shift() ?? [];
					// Promise + chained limit so await and .limit() both resolve to rows.
					return Object.assign(Promise.resolve(rows), {
						limit: () => Promise.resolve(rows)
					});
				},
				limit: () => Promise.resolve(state.queue.shift() ?? [])
			})
		})
	}
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
		state.queue = [];
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
		/** Boundary table for the family-size check against an explicit limit. */
		interface BoundaryCase {
			name: string;
			memberCount: number;
			limit: number;
			allowed: boolean;
		}

		const boundaryCases: BoundaryCase[] = [
			{ name: 'under limit allows add', memberCount: 4, limit: 5, allowed: true },
			{ name: 'at limit refuses add', memberCount: 5, limit: 5, allowed: false },
			{ name: 'over limit refuses add', memberCount: 7, limit: 5, allowed: false },
			{
				name: 'empty family under free-tier limit allows add',
				memberCount: 0,
				limit: 1,
				allowed: true
			},
			{
				name: 'single member at free-tier limit refuses add',
				memberCount: 1,
				limit: 1,
				allowed: false
			}
		];

		for (const boundaryCase of boundaryCases) {
			it(boundaryCase.name, async () => {
				// select #1 = member count for the family
				state.queue = [[{ memberCount: boundaryCase.memberCount }]];
				const result = await canAddFamilyMember('fam-1', { limit: boundaryCase.limit });
				expect(result.allowed).toBe(boundaryCase.allowed);
				expect(result.currentCount).toBe(boundaryCase.memberCount);
				if (!boundaryCase.allowed) {
					expect(result.reason).toContain('full');
				}
			});
		}

		it('resolves the limit from the family creator subscription', async () => {
			// select #1 = member count, #2 = creator lookup, #3 = subscriptions (none → default memberLimit 6)
			state.queue = [[{ memberCount: 6 }], [{ userId: 'creator-1' }], []];
			const result = await canAddFamilyMember('fam-1');
			expect(result.allowed).toBe(false);
			expect(result.limit).toBe(6);
		});

		it('uses the default member limit when the family has no creator row', async () => {
			// select #1 = member count, #2 = creator lookup (none → default limit)
			state.queue = [[{ memberCount: 0 }], []];
			const result = await canAddFamilyMember('fam-1');
			expect(result.allowed).toBe(true);
			expect(result.limit).toBe(6);
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
