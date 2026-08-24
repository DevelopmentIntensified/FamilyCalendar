import { db } from '$lib/server/db';
import { adEvents, userAdConsent, events, type CalendarEvent } from '$lib/server/db/schema';
import { eq, and, sql, gte, lt, asc } from 'drizzle-orm';
import { generateId } from 'lucia';
import { DateTime } from 'luxon';
import { getUserZone } from '$lib/server/utils/userTimezone';
import {
	uploadAdAsset,
	getBlobUrl,
	deleteAdAssetByFilename,
	listBlobAssets
} from './blobService';

export interface AdEventData {
	eventId: string;
	eventDate: Date;
	adType: 'sponsored' | 'promotional' | 'newsletter';
	adContent: {
		sponsorName: string;
		message: string;
		description?: string;
		ctaText?: string;
		ctaLink?: string;
		targetPlan?: string;
		deadline?: Date;
	};
	imageUrl?: string;
	impressionCount: number;
}

export interface GenerateAdsParams {
	userId: string;
	month: number;
	year: number;
	adsPerMonth?: number;
}

const AD_TEMPLATES = [
	{
		sponsorName: 'Family Planning Pro',
		message: 'Upgrade to Premium and unlock unlimited family members!',
		ctaText: 'Upgrade Now',
		ctaLink: '/pricing',
		targetPlan: 'premium'
	},
	{
		sponsorName: 'Family Calendar',
		message: 'Get 20% off annual plans this month only!',
		ctaText: 'Claim Discount',
		ctaLink: '/pricing',
		targetPlan: 'annual'
	},
	{
		sponsorName: 'Feature Alert',
		message: 'Check out our new archive retention feature - preserve memories forever!',
		ctaText: 'Learn More',
		ctaLink: '/features',
		targetPlan: null
	},
	{
		sponsorName: 'Family Calendar',
		message: 'Invite your extended family - groups now support 5+ members!',
		ctaText: 'Invite Family',
		ctaLink: '/family/create',
		targetPlan: null
	}
];

export async function checkUserAdConsent(userId: string): Promise<boolean> {
	const [consent] = await db
		.select()
		.from(userAdConsent)
		.where(eq(userAdConsent.userId, userId));

	if (!consent) {
		return false;
	}

	return true;
}

export async function setUserAdConsent(userId: string, enabled: boolean): Promise<void> {
	const existing = await db
		.select()
		.from(userAdConsent)
		.where(eq(userAdConsent.userId, userId));

	if (existing.length > 0) {
		return;
	}

	await db.insert(userAdConsent).values({
		userId
	});
}

export async function getAdConsentStatus(userId: string): Promise<{ userId: string } | null> {
	const [consent] = await db
		.select()
		.from(userAdConsent)
		.where(eq(userAdConsent.userId, userId));

	return consent ?? null;
}

export async function getExistingAdEventsForMonth(
	userId: string,
	month: number,
	year: number
): Promise<AdEventData[]> {
	const zone = await getUserZone(userId);
	const monthStart = DateTime.fromObject({ year, month, day: 1 }, { zone }).startOf('month');
	const monthEnd = monthStart.plus({ months: 1 });

	const existingAds = await db
		.select()
		.from(events)
		.where(
			and(
				eq(events.ownerId, userId),
				sql`${events.title} LIKE '📢%'`,
				gte(events.start, monthStart.toJSDate().toISOString()),
				lt(events.start, monthEnd.toJSDate().toISOString())
			)
		)
		.orderBy(asc(events.start));

	return existingAds.map((event) => {
		const titleContent = event.title.replace('📢', '').trim();
		return {
			eventId: event.id,
			eventDate: new Date(event.start),
			adType: 'sponsored' as const,
			adContent: {
				sponsorName: '',
				message: titleContent,
				description: event.description ?? ''
			},
			impressionCount: 1
		};
	});
}

export async function generateAdEventsForMonth({
	userId,
	month,
	year,
	adsPerMonth = 3
}: GenerateAdsParams): Promise<AdEventData[]> {
	const hasConsent = await checkUserAdConsent(userId);

	if (!hasConsent) {
		return [];
	}

	const existingAds = await getExistingAdEventsForMonth(userId, month, year);
	const adsToGenerate = Math.max(0, adsPerMonth - existingAds.length);

	if (adsToGenerate <= 0) {
		return existingAds;
	}

	const generatedAds: AdEventData[] = [];
	const zone = await getUserZone(userId);
	const daysInMonth = DateTime.fromObject({ year, month }, { zone }).daysInMonth ?? 30;

	const usedTemplates: number[] = [];

	for (let i = 0; i < adsToGenerate; i++) {
		let templateIndex: number;
		do {
			templateIndex = Math.floor(Math.random() * AD_TEMPLATES.length);
		} while (usedTemplates.includes(templateIndex) && usedTemplates.length < AD_TEMPLATES.length);

		usedTemplates.push(templateIndex);

		const template = AD_TEMPLATES[templateIndex];
		const dayOffset = Math.floor(Math.random() * daysInMonth);
		const eventDate = DateTime.fromObject(
			{ year, month, day: dayOffset + 1, hour: 10 },
			{ zone }
		).toJSDate();

		const adEvent: AdEventData = {
			eventId: generateId(15),
			eventDate,
			adType: 'sponsored',
			adContent: {
				sponsorName: template.sponsorName,
				message: template.message,
				ctaText: template.ctaText ?? undefined,
				ctaLink: template.ctaLink ?? undefined,
				targetPlan: template.targetPlan ?? undefined
			},
			impressionCount: 0
		};

		generatedAds.push(adEvent);
	}

	return generatedAds;
}

export async function injectAdEvent(
	calendarId: string,
	ownerId: string,
	adData: AdEventData
): Promise<string> {
	const [adEvent] = await db
		.insert(events)
		.values({
			id: adData.eventId,
			calendarId,
			ownerId,
			title: `📢 ${adData.adContent.sponsorName}: ${adData.adContent.message}`,
			start: adData.eventDate.toISOString(),
			end: new Date(adData.eventDate.getTime() + 60 * 60 * 1000).toISOString(),
			description: adData.adContent.ctaText
				? `${adData.adContent.message}\n\n${adData.adContent.ctaText}: ${adData.adContent.ctaLink ?? ''}`
				: adData.adContent.message
		})
		.returning();

	await db.insert(adEvents).values({
		id: generateId(15),
		sponsorName: adData.adContent.sponsorName,
		message: adData.adContent.message,
		ctaText: adData.adContent.ctaText ?? null,
		ctaLink: adData.adContent.ctaLink ?? null,
		targetPlan: adData.adContent.targetPlan ?? null,
		deadline: adData.adContent.deadline ?? null,
		scheduledFor: adData.eventDate,
		impressions: 0,
		clicks: 0,
		conversions: 0
	});

	return adEvent.id;
}

export async function trackAdImpression(adEventId: string): Promise<void> {
	await db
		.update(adEvents)
		.set({
			impressions: sql`${adEvents.impressions} + 1`
		})
		.where(eq(adEvents.id, adEventId));
}

export async function trackAdClick(adEventId: string): Promise<void> {
	await db
		.update(adEvents)
		.set({
			clicks: sql`${adEvents.clicks} + 1`
		})
		.where(eq(adEvents.id, adEventId));
}

export interface UploadAdImageParams {
	filename: string;
	imageData: Buffer;
	contentType?: string;
}

export async function uploadAdImage({
	filename,
	imageData,
	contentType = 'image/png'
}: UploadAdImageParams): Promise<string> {
	const asset = await uploadAdAsset({
		filename,
		content: imageData,
		contentType
	});

	return asset.url;
}

export async function getAdImageUrl(filename: string): Promise<string> {
	return getBlobUrl(filename);
}

export async function deleteAdImage(filename: string): Promise<void> {
	return deleteAdAssetByFilename(filename);
}

export async function listAdImages(prefix?: string): Promise<string[]> {
	const assets = await listBlobAssets(prefix);
	return assets.map((asset) => asset.url);
}

export async function getAdEventsForUser(
	userId: string,
	month: number,
	year: number
): Promise<CalendarEvent[]> {
	const existingAds = await getExistingAdEventsForMonth(userId, month, year);
	
	if (existingAds.length > 0) {
		return existingAds.map((ad) => ({
			id: ad.eventId,
			title: `📢 ${ad.adContent.message}`,
			description: ad.adContent.description || '',
			start: ad.eventDate.toISOString(),
			end: ad.eventDate.toISOString(),
			allDay: true,
			calendarId: '',
			ownerId: userId,
			familyId: null,
			location: null,
			recurrenceFrequency: null,
			recurrenceInterval: null,
			created_at: new Date()
		}));
	}

	const generatedAds = await generateAdEventsForMonth({ userId, month, year, adsPerMonth: 3 });
	
	return generatedAds.map((ad) => ({
		id: ad.eventId,
		title: `📢 ${ad.adContent.message}`,
		description: ad.adContent.description || '',
		start: ad.eventDate.toISOString(),
		end: ad.eventDate.toISOString(),
		allDay: true,
		calendarId: '',
		ownerId: userId,
		familyId: null,
		location: null,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		created_at: new Date()
	}));
}