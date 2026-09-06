import { db } from '$lib/server/db';
import {
	subscriptions,
	subscriptionTypes,
	familyMembers,
	aiUsageTracking
} from '$lib/server/db/schema';
import { count, eq, and, or, sql, isNotNull, isNull, desc } from 'drizzle-orm';

export type SubscriptionTier = typeof subscriptionTypes.$inferSelect;

export interface SubscriptionLimits {
	familyLimit: number;
	memberLimit: number;
	retentionViewDays: number;
	archivedRetentionDays: number;
	attachmentLimitBytes: number;
	aiEventCreationsPerMonth: number;
	exportImportEnabled: boolean;
}

export interface SubscriptionCheckResult {
	canAddFamily: boolean;
	canViewArchive: boolean;
	canUploadAttachment: boolean;
	currentFamilyCount?: number;
	attachmentSize?: number;
	reason?: string;
}

/**
 * The user's active subscription ROW: linked to a tier and not expired,
 * newest first. Single seam for reading a subscription row so override
 * reads can't come from an expired or stale row.
 */
async function getActiveSubscriptionRow(
	userId: string
): Promise<typeof subscriptions.$inferSelect | null> {
	const [sub] = await db
		.select()
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.userId, userId),
				isNotNull(subscriptions.subscriptionTypeId),
				or(sql`${subscriptions.endDate} > NOW()`, isNull(subscriptions.endDate))
			)
		)
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	return sub ?? null;
}

async function getTierForSubscription(sub: typeof subscriptions.$inferSelect) {
	if (!sub.subscriptionTypeId) return null;
	const [tier] = await db
		.select()
		.from(subscriptionTypes)
		.where(eq(subscriptionTypes.id, sub.subscriptionTypeId))
		.limit(1);
	return tier ?? null;
}

export async function getUserSubscription(userId: string): Promise<SubscriptionTier | null> {
	const sub = await getActiveSubscriptionRow(userId);
	if (!sub) return null;
	return await getTierForSubscription(sub);
}

export interface SubscriptionStatus {
	tier: SubscriptionTier | null;
	subscription: {
		id: string;
		startDate: Date;
		endDate: Date;
		createdAt: Date;
	} | null;
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
	const sub = await getActiveSubscriptionRow(userId);

	if (!sub) {
		return { tier: null, subscription: null };
	}

	const tier = await getTierForSubscription(sub);

	return {
		tier,
		subscription: {
			id: sub.id,
			startDate: sub.startDate,
			endDate: sub.endDate,
			createdAt: sub.createdAt
		}
	};
}

export async function getUserSubscriptionLimits(userId: string): Promise<SubscriptionLimits> {
	// Same active-sub filter (tiered, not expired) + newest-first ordering as
	// getUserSubscription: an override must come from the CURRENT subscription
	// row, never an expired or arbitrary one.
	const sub = await getActiveSubscriptionRow(userId);

	if (!sub) {
		return {
			familyLimit: 1,
			memberLimit: 6,
			retentionViewDays: 30,
			archivedRetentionDays: 90,
			attachmentLimitBytes: 10485760,
			aiEventCreationsPerMonth: 10,
			exportImportEnabled: true
		};
	}

	const tier = await getTierForSubscription(sub);
	if (!tier) {
		return getDefaultLimits();
	}

	return {
		familyLimit: sub.familyLimitOverride ?? tier.familyLimit,
		memberLimit: sub.memberLimitOverride ?? tier.memberLimit,
		retentionViewDays: sub.retentionViewDaysOverride ?? tier.retentionViewDays,
		archivedRetentionDays: sub.archivedRetentionDaysOverride ?? tier.archivedRetentionDays,
		attachmentLimitBytes: sub.attachmentLimitBytesOverride ?? tier.attachmentLimitBytes,
		aiEventCreationsPerMonth: tier.aiEventCreationsPerMonth,
		exportImportEnabled: tier.exportImportEnabled
	};
}

/**
 * Member limit of a family: the creator's subscription memberLimit (with any
 * override), falling back to the default tier limit when no creator row exists.
 */
async function getFamilySizeLimit(familyId: string): Promise<number> {
	const [creator] = await db
		.select({ userId: familyMembers.userId })
		.from(familyMembers)
		.where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.role, 'creator')))
		.limit(1);

	if (!creator) return getDefaultLimits().memberLimit;

	const limits = await getUserSubscriptionLimits(creator.userId);
	return limits.memberLimit;
}

/**
 * Whether a member can be added to a specific family: counts the members
 * currently IN the family (not the user's own memberships) against the
 * family creator's subscription limit.
 */
export async function canAddFamilyMember(
	familyId: string,
	options?: { limit?: number }
): Promise<{ allowed: boolean; limit: number; currentCount: number; reason?: string }> {
	const [countRow] = await db
		.select({ memberCount: count() })
		.from(familyMembers)
		.where(eq(familyMembers.familyId, familyId));

	const currentCount = countRow?.memberCount ?? 0;
	const limit = options?.limit ?? (await getFamilySizeLimit(familyId));

	if (currentCount >= limit) {
		return {
			allowed: false,
			limit,
			currentCount,
			reason: `Family is full (${limit} member limit). Upgrade to add more members.`
		};
	}

	return { allowed: true, limit, currentCount };
}

export async function canCreateFamily(
	userId: string
): Promise<{ allowed: boolean; limit?: number; reason?: string }> {
	const limits = await getUserSubscriptionLimits(userId);

	const userFamilies = await db
		.select()
		.from(familyMembers)
		.where(eq(familyMembers.userId, userId))
		.limit(100);

	const userFamiliesArray = Array.isArray(userFamilies) ? userFamilies : [];
	const uniqueFamilyIds = new Set(userFamiliesArray.map((f) => f.familyId));
	const familyCount = uniqueFamilyIds.size;
	const availableSlots = limits.familyLimit - familyCount;

	if (availableSlots <= 0) {
		return {
			allowed: false,
			limit: limits.familyLimit,
			reason: `Family limit reached (${limits.familyLimit}). Upgrade to create more families.`
		};
	}

	return { allowed: true, limit: limits.familyLimit };
}

export async function canViewArchivedEvent(
	userId: string,
	eventDate: Date
): Promise<{ allowed: boolean; reason?: string }> {
	const limits = await getUserSubscriptionLimits(userId);
	const now = new Date();
	const cutoffDate = new Date(now.getTime() - limits.retentionViewDays * 24 * 60 * 60 * 1000);

	if (eventDate < cutoffDate) {
		return {
			allowed: false,
			reason: 'Event is older than your retention limit. Upgrade to view archived events.'
		};
	}

	return { allowed: true };
}

export async function canViewArchive(
	userId: string
): Promise<{ allowed: boolean; reason?: string }> {
	const limits = await getUserSubscriptionLimits(userId);

	// Archive access is a plan capability: tiers without archive storage set
	// archivedRetentionDays to 0.
	if (limits.archivedRetentionDays <= 0) {
		return { allowed: false, reason: 'Archive view not available on your plan' };
	}

	return { allowed: true };
}

export async function canUploadAttachment(
	userId: string,
	fileSizeBytes: number
): Promise<{ allowed: boolean; limitBytes?: number; reason?: string }> {
	const limits = await getUserSubscriptionLimits(userId);

	if (fileSizeBytes > limits.attachmentLimitBytes) {
		return {
			allowed: false,
			limitBytes: limits.attachmentLimitBytes,
			reason: `File too large. Max ${Math.round(limits.attachmentLimitBytes / 1048576)}MB on your plan.`
		};
	}

	return { allowed: true, limitBytes: limits.attachmentLimitBytes };
}

export async function checkSubscriptionAction(
	action: 'addFamily' | 'viewArchive' | 'uploadAttachment',
	params?: { userId?: string; fileSizeBytes?: number; familyId?: string }
): Promise<SubscriptionCheckResult> {
	const userId = params?.userId ?? '';
	const familyId = params?.familyId ?? '';

	switch (action) {
		case 'addFamily': {
			const familyCheck = await canAddFamilyMember(familyId);
			const membersResult = await db
				.select()
				.from(familyMembers)
				.where(eq(familyMembers.userId, userId));

			return {
				canAddFamily: familyCheck.allowed,
				canViewArchive: (await canViewArchive(userId)).allowed,
				canUploadAttachment: (await canUploadAttachment(userId, params?.fileSizeBytes ?? 0))
					.allowed,
				currentFamilyCount: membersResult.length,
				reason: familyCheck.reason
			};
		}

		case 'viewArchive': {
			const archiveCheck = await canViewArchive(userId);
			return {
				canAddFamily: (await canAddFamilyMember(familyId)).allowed,
				canViewArchive: archiveCheck.allowed,
				canUploadAttachment: (await canUploadAttachment(userId, params?.fileSizeBytes ?? 0))
					.allowed,
				reason: archiveCheck.reason
			};
		}

		case 'uploadAttachment': {
			const fileSize = params?.fileSizeBytes ?? 0;
			const uploadCheck = await canUploadAttachment(userId, fileSize);
			return {
				canAddFamily: (await canAddFamilyMember(familyId)).allowed,
				canViewArchive: (await canViewArchive(userId)).allowed,
				canUploadAttachment: uploadCheck.allowed,
				attachmentSize: fileSize,
				reason: uploadCheck.reason
			};
		}

		default:
			return {
				canAddFamily: false,
				canViewArchive: false,
				canUploadAttachment: false,
				reason: 'Unknown action'
			};
	}
}

export function getDefaultLimits(): SubscriptionLimits {
	return {
		familyLimit: 1,
		memberLimit: 6,
		retentionViewDays: 30,
		archivedRetentionDays: 90,
		attachmentLimitBytes: 10485760,
		aiEventCreationsPerMonth: 10,
		exportImportEnabled: true
	};
}

export async function getAllSubscriptionTiers(): Promise<SubscriptionTier[]> {
	return await db.select().from(subscriptionTypes).where(eq(subscriptionTypes.enabled, true));
}

export async function getAiUsageThisMonth(
	userId: string
): Promise<{ used: number; limit: number; remaining: number }> {
	const now = new Date();
	const month = now.getMonth() + 1;
	const year = now.getFullYear();
	const limits = await getUserSubscriptionLimits(userId);

	const [usage] = await db
		.select()
		.from(aiUsageTracking)
		.where(
			and(
				eq(aiUsageTracking.userId, userId),
				eq(aiUsageTracking.month, month),
				eq(aiUsageTracking.year, year)
			)
		)
		.limit(1);

	const used = usage?.aiEventCreationsUsed ?? 0;
	const limit = limits.aiEventCreationsPerMonth;

	return {
		used,
		limit,
		remaining: Math.max(0, limit - used)
	};
}

export async function canUseAiFeature(
	userId: string
): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
	const usage = await getAiUsageThisMonth(userId);

	if (usage.remaining <= 0) {
		return {
			allowed: false,
			reason: `AI feature limit reached (${usage.limit} per month). Upgrade to unlock unlimited AI.`,
			remaining: 0
		};
	}

	return { allowed: true, remaining: usage.remaining };
}

export async function recordAiUsage(
	userId: string
): Promise<{ success: boolean; remaining: number }> {
	const now = new Date();
	const month = now.getMonth() + 1;
	const year = now.getFullYear();
	const [existing] = await db
		.select()
		.from(aiUsageTracking)
		.where(
			and(
				eq(aiUsageTracking.userId, userId),
				eq(aiUsageTracking.month, month),
				eq(aiUsageTracking.year, year)
			)
		)
		.limit(1);

	if (existing) {
		await db
			.update(aiUsageTracking)
			.set({
				aiEventCreationsUsed: existing.aiEventCreationsUsed + 1,
				updatedAt: new Date()
			})
			.where(
				and(
					eq(aiUsageTracking.userId, userId),
					eq(aiUsageTracking.month, month),
					eq(aiUsageTracking.year, year)
				)
			);
	} else {
		await db.insert(aiUsageTracking).values({
			userId,
			month,
			year,
			aiEventCreationsUsed: 1
		});
	}

	const usage = await getAiUsageThisMonth(userId);
	return { success: true, remaining: usage.remaining };
}

export async function canExportImport(
	userId: string
): Promise<{ allowed: boolean; reason?: string }> {
	const limits = await getUserSubscriptionLimits(userId);

	if (!limits.exportImportEnabled) {
		return {
			allowed: false,
			reason: 'Export/Import not available on your plan. Upgrade to access.'
		};
	}

	return { allowed: true };
}
