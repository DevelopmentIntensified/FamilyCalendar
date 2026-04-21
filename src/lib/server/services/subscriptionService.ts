import { db } from '$lib/server/db';
import { subscriptions, subscriptionTypes, familyMembers } from '$lib/server/db/schema';
import { eq, and, sql, isNotNull, isNull } from 'drizzle-orm';

export type SubscriptionTier = typeof subscriptionTypes.$inferSelect;

export interface SubscriptionLimits {
	familyLimit: number;
	retentionViewDays: number;
	archivedRetentionDays: number;
	attachmentLimitBytes: number;
}

export interface SubscriptionCheckResult {
	canAddFamily: boolean;
	canViewArchive: boolean;
	canUploadAttachment: boolean;
	currentFamilyCount?: number;
	attachmentSize?: number;
	reason?: string;
}

export async function getUserSubscription(
	userId: string
): Promise<SubscriptionTier | null> {
	const userSubscription = await db
		.select()
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.userId, userId),
				isNotNull(subscriptions.subscriptionTypeId),
				or(
					sql`${subscriptions.endDate} > NOW()`,
					isNull(subscriptions.endDate)
				)
			)
		)
		.limit(1);

	if (userSubscription.length === 0) {
		return null;
	}

	const [sub] = userSubscription;

	if (!sub.subscriptionTypeId) {
		return null;
	}

	const [tier] = await db
		.select()
		.from(subscriptionTypes)
		.where(eq(subscriptionTypes.id, sub.subscriptionTypeId))
		.limit(1);

	return tier ?? null;
}

export async function getUserSubscriptionLimits(
	userId: string
): Promise<SubscriptionLimits> {
	const tier = await getUserSubscription(userId);

	if (!tier) {
		return {
			familyLimit: 1,
			retentionViewDays: 30,
			archivedRetentionDays: 90,
			attachmentLimitBytes: 10485760
		};
	}

	const userSubscription = await db
		.select()
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.limit(1);

	const [sub] = userSubscription;

	return {
		familyLimit: sub?.familyLimitOverride ?? tier.familyLimit,
		retentionViewDays: sub?.retentionViewDaysOverride ?? tier.retentionViewDays,
		archivedRetentionDays: sub?.archivedRetentionDaysOverride ?? tier.archivedRetentionDays,
		attachmentLimitBytes: sub?.attachmentLimitBytesOverride ?? tier.attachmentLimitBytes
	};
}

export async function canAddFamilyMember(userId: string): Promise<{ allowed: boolean; reason?: string }> {
	const limits = await getUserSubscriptionLimits(userId);

	const currentFamilyMembers = await db
		.select()
		.from(familyMembers)
		.where(eq(familyMembers.userId, userId));

	const familyCount = currentFamilyMembers.length;
	const availableSlots = limits.familyLimit - familyCount;

	if (availableSlots <= 0) {
		return {
			allowed: false,
			reason: `Family limit reached (${limits.familyLimit} members). Upgrade to add more.`
		};
	}

	return { allowed: true };
}

export async function canViewArchive(userId: string): Promise<{ allowed: boolean; reason?: string }> {
	const limits = await getUserSubscriptionLimits(userId);

	const now = new Date();
	const cutoffDate = new Date(now.getTime() - limits.retentionViewDays * 24 * 60 * 60 * 1000);

	if (cutoffDate > now) {
		return { allowed: false, reason: 'Archive view not available on your plan' };
	}

	return { allowed: true };
}

export async function canUploadAttachment(
	userId: string,
	fileSizeBytes: number
): Promise<{ allowed: boolean; reason?: string }> {
	const limits = await getUserSubscriptionLimits(userId);

	if (fileSizeBytes > limits.attachmentLimitBytes) {
		return {
			allowed: false,
			reason: `File too large. Max ${Math.round(limits.attachmentLimitBytes / 1048576)}MB on your plan.`
		};
	}

	return { allowed: true };
}

function or(...conditions: ReturnType<typeof sql>[]) {
	return sql`(${conditions.map((c, i) => i === 0 ? c : sql` OR ${c}`).join('')})`;
}

export async function checkSubscriptionAction(
	action: 'addFamily' | 'viewArchive' | 'uploadAttachment',
	params?: { userId?: string; fileSizeBytes?: number }
): Promise<SubscriptionCheckResult> {
	const userId = params?.userId ?? '';

	switch (action) {
		case 'addFamily': {
			const familyCheck = await canAddFamilyMember(userId);
			const membersResult = await db
				.select()
				.from(familyMembers)
				.where(eq(familyMembers.userId, userId));

			return {
				canAddFamily: familyCheck.allowed,
				canViewArchive: (await canViewArchive(userId)).allowed,
				canUploadAttachment: (await canUploadAttachment(userId, params?.fileSizeBytes ?? 0)).allowed,
				currentFamilyCount: membersResult.length,
				reason: familyCheck.reason
			};
		}

		case 'viewArchive': {
			const archiveCheck = await canViewArchive(userId);
			return {
				canAddFamily: (await canAddFamilyMember(userId)).allowed,
				canViewArchive: archiveCheck.allowed,
				canUploadAttachment: (await canUploadAttachment(userId, params?.fileSizeBytes ?? 0)).allowed,
				reason: archiveCheck.reason
			};
		}

		case 'uploadAttachment': {
			const fileSize = params?.fileSizeBytes ?? 0;
			const uploadCheck = await canUploadAttachment(userId, fileSize);
			return {
				canAddFamily: (await canAddFamilyMember(userId)).allowed,
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
		retentionViewDays: 30,
		archivedRetentionDays: 90,
		attachmentLimitBytes: 10485760
	};
}

export async function getAllSubscriptionTiers(): Promise<SubscriptionTier[]> {
	return await db.select().from(subscriptionTypes).where(eq(subscriptionTypes.enabled, true));
}