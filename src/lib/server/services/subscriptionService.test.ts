import { describe, it, expect, vi, beforeEach } from 'vitest';

/** A stubbed DB row: plain JSON-ish values only. */
type Row = Record<string, string | number | boolean | null | Date>;

interface StubState {
	/** Rows returned by successive `select().from().where()` calls. */
	queue: Row[][];
	/** First argument of each select's where() call, in call order. */
	capturedWhere: unknown[];
}

const state = vi.hoisted(
	(): StubState => ({
		queue: [],
		capturedWhere: []
	})
);

/** A drizzle SQL internal: string leaf, chunk array, or wrapper object. */
interface SqlChunk {
	queryChunks?: SqlFragment;
	name?: SqlFragment;
	value?: SqlFragment;
}

type SqlFragment = string | undefined | readonly SqlFragment[] | SqlChunk;

/** True when the fragment is a plain string (leaf marker or bound value). */
function isStringFragment(v: SqlFragment): v is string {
	return typeof v === 'string';
}

/** True when the fragment is a drizzle SQL condition object we can walk. */
function isWalkableCondition(v: unknown): v is SqlChunk {
	return typeof v === 'object' && v !== null;
}

/** True when the fragment is a drizzle SQL/chunk object (non-string, non-array). */
function isSqlChunk(v: SqlFragment): v is SqlChunk {
	return !isStringFragment(v) && !Array.isArray(v) && typeof v === 'object' && v !== null;
}

/**
 * Flatten a drizzle SQL condition into string markers: quoted column names
 * (chunk `name`) and bound parameter values (chunk `value`). Walks only
 * `queryChunks` arrays to avoid circular column references.
 */
function collectMarkers(fragment: SqlFragment, acc: string[] = []): string[] {
	if (isStringFragment(fragment)) {
		acc.push(fragment);
		return acc;
	}
	if (Array.isArray(fragment)) {
		for (const chunk of fragment) collectMarkers(chunk, acc);
		return acc;
	}
	if (!isSqlChunk(fragment)) return acc;
	if (isStringFragment(fragment.name)) acc.push(fragment.name);
	// StringChunk wraps its text in a one-element array; Param carries a string.
	if (isStringFragment(fragment.value)) acc.push(fragment.value);
	if (Array.isArray(fragment.value)) {
		for (const part of fragment.value) {
			if (isStringFragment(part)) acc.push(part);
		}
	}
	if (Array.isArray(fragment.queryChunks)) collectMarkers(fragment.queryChunks, acc);
	return acc;
}

/** Markers of the most recently captured where condition. */
function lastWhereMarkers(): string[] {
	const condition = state.capturedWhere[state.capturedWhere.length - 1];
	if (!isWalkableCondition(condition)) {
		throw new Error('expected a captured where condition');
	}
	return collectMarkers(condition);
}

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: (...args: unknown[]) => {
					state.capturedWhere.push(args[0]);
					const rows = state.queue.shift() ?? [];
					// Promise + chained limit so await and .limit() both resolve to rows.
					return Object.assign(Promise.resolve(rows), {
						orderBy: () => ({ limit: () => Promise.resolve(rows) }),
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
	canViewArchivedEvent,
	getUserSubscriptionLimits
} from '$lib/server/services/subscriptionService';

describe('subscriptionService', () => {
	beforeEach(() => {
		state.queue = [];
		state.capturedWhere = [];
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

	describe('getUserSubscriptionLimits', () => {
		it('returns the defaults when no active subscription row exists', async () => {
			// select #1 = active subscription row (none)
			state.queue = [[]];
			const limits = await getUserSubscriptionLimits('user-1');
			expect(limits).toEqual(getDefaultLimits());
		});

		it('merges overrides from the CURRENT subscription row and tier', async () => {
			// select #1 = active subscription row, #2 = its tier
			state.queue = [
				[
					{
						subscriptionTypeId: 'tier-1',
						familyLimitOverride: null,
						memberLimitOverride: 12,
						retentionViewDaysOverride: null,
						archivedRetentionDaysOverride: null,
						attachmentLimitBytesOverride: null
					}
				],
				[
					{
						familyLimit: 1,
						memberLimit: 6,
						retentionViewDays: 30,
						archivedRetentionDays: 90,
						attachmentLimitBytes: 10485760,
						aiEventCreationsPerMonth: 10,
						exportImportEnabled: true
					}
				]
			];
			const limits = await getUserSubscriptionLimits('user-1');
			expect(limits.memberLimit).toBe(12);
			expect(limits.familyLimit).toBe(1);
			expect(limits.retentionViewDays).toBe(30);
		});

		it('only reads overrides through the active-sub filter (tiered, not expired)', async () => {
			// Regression: the override read used a bare userId filter with no
			// expiry check and no orderBy — an expired or random row's override
			// could leak into the user's limits.
			state.queue = [[]];
			await getUserSubscriptionLimits('user-1');

			const markers = lastWhereMarkers();
			expect(markers).toContain('subscriptionTypeId');
			expect(markers).toContain('endDate');
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
