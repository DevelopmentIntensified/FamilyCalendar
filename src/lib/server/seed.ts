import { db } from '$lib/server/db';
import { subscriptionTypes, discounts, adEvents, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

async function seed() {
	console.log('Seeding subscription types...');

	await db.insert(subscriptionTypes).values([
		{
			id: 'free',
			name: 'Free',
			tierName: 'free',
			planType: 'individual',
			displayName: 'Free',
			durationMonths: 0,
			enabled: true,
			familyLimit: 1,
			retentionViewDays: 30,
			archivedRetentionDays: 90,
			attachmentLimitBytes: 10485760,
			aiEventCreationsPerMonth: 10,
			exportImportEnabled: true
		},
		{
			id: 'cal-master-monthly',
			name: 'Cal Master Monthly',
			tierName: 'cal_master',
			planType: 'individual',
			displayName: 'Cal Master',
			durationMonths: 1,
			enabled: true,
			familyLimit: 1,
			retentionViewDays: 365 * 10,
			archivedRetentionDays: 365 * 10,
			attachmentLimitBytes: 1073741824,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: true
		},
		{
			id: 'cal-master-annual',
			name: 'Cal Master Annual',
			tierName: 'cal_master',
			planType: 'individual',
			displayName: 'Cal Master',
			durationMonths: 12,
			enabled: true,
			familyLimit: 1,
			retentionViewDays: 365 * 10,
			archivedRetentionDays: 365 * 10,
			attachmentLimitBytes: 1073741824,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: true
		},
		{
			id: 'family-master-monthly',
			name: 'Family Master Monthly',
			tierName: 'family_master',
			planType: 'family',
			displayName: 'Family Master',
			durationMonths: 1,
			enabled: true,
			familyLimit: 999,
			retentionViewDays: 365 * 10,
			archivedRetentionDays: 365 * 10,
			attachmentLimitBytes: 1073741824,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: true
		},
		{
			id: 'family-master-annual',
			name: 'Family Master Annual',
			tierName: 'family_master',
			planType: 'family',
			displayName: 'Family Master',
			durationMonths: 12,
			enabled: true,
			familyLimit: 999,
			retentionViewDays: 365 * 10,
			archivedRetentionDays: 365 * 10,
			attachmentLimitBytes: 1073741824,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: true
		},
		{
			id: 'family-master-lifetime',
			name: 'Family Master Lifetime',
			tierName: 'family_master',
			planType: 'family',
			displayName: 'Family Master',
			durationMonths: 999,
			enabled: true,
			familyLimit: 999,
			retentionViewDays: 365 * 100,
			archivedRetentionDays: 365 * 100,
			attachmentLimitBytes: 1073741824,
			aiEventCreationsPerMonth: 999999,
			exportImportEnabled: true
		}
	]).onConflictDoNothing();

	console.log('Seeding discounts...');

	await db.insert(discounts).values([
		{
			id: 'lifetime-discount',
			name: 'Lifetime Discount',
			description: '20% off lifetime plan when upgrading from annual',
			eligibleRole: 'annual_subscriber',
			discountRate: 20,
			durationMonths: 999,
			appliesToMonthly: false,
			appliesToAnnual: false,
			appliesToLifetime: true,
			stackable: false,
			enabled: true
		},
		{
			id: 'family-member-discount',
			name: 'Family Member Discount',
			description: '40% off for families with 4+ members on annual plan',
			eligibleRole: 'family_member',
			minFamilyMembers: 4,
			discountRate: 40,
			durationMonths: 12,
			appliesToMonthly: false,
			appliesToAnnual: true,
			appliesToLifetime: false,
			stackable: true,
			enabled: true
		}
	]).onConflictDoNothing();

	console.log('Seeding test ad events...');

	const testUsers = await db.select({ id: users.id }).from(users).limit(5);

	if (testUsers.length > 0) {
		const now = new Date();
		const adTemplates = [
			{ sponsorName: 'Local Store', message: 'Summer Sale! Get 50% off', ctaText: 'Shop Now', ctaLink: 'https://example.com/sale', targetPlan: 'free' },
			{ sponsorName: 'Family Products', message: 'Check out our latest family organizer', ctaText: 'Learn More', ctaLink: 'https://example.com/product', targetPlan: 'free' },
			{ sponsorName: 'Recipe Club', message: 'Share your favorite family recipes', ctaText: 'Join', ctaLink: 'https://example.com/recipes', targetPlan: 'free' },
			{ sponsorName: 'Holiday Helpers', message: 'Start planning your holiday events early', ctaText: 'Get Tips', ctaLink: 'https://example.com/holidays', targetPlan: 'free' },
			{ sponsorName: 'School Tools', message: 'Organize your school schedules', ctaText: 'Sign Up', ctaLink: 'https://example.com/school', targetPlan: 'free' }
		];

		for (let i = 0; i < 5; i++) {
			const scheduledFor = new Date(now.getTime() + (i - 2) * 7 * 24 * 60 * 60 * 1000);
			const expiresAt = new Date(scheduledFor.getTime() + 30 * 24 * 60 * 60 * 1000);
			const template = adTemplates[i % adTemplates.length];

			await db.insert(adEvents).values({
				id: `test-ad-${i + 1}`,
				userId: testUsers[0].id,
				sponsorName: template.sponsorName,
				message: template.message,
				ctaText: template.ctaText,
				ctaLink: template.ctaLink,
				targetPlan: template.targetPlan,
				scheduledFor,
				expiresAt,
				impressions: Math.floor(Math.random() * 100) + 10,
				clicks: Math.floor(Math.random() * 10),
				conversions: 0
			}).onConflictDoNothing();
		}
	}

	console.log('Seed complete!');
}

seed().catch(console.error);