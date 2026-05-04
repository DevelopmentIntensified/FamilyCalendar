import { db } from '$lib/server/db';
import { adEvents, events } from '$lib/server/db/schema';
import { sql, gte, lte, asc, eq, and } from 'drizzle-orm';
import { generateId } from 'lucia';

export interface AdRecord {
	id: string;
	sponsorName: string;
	message: string;
	ctaText: string | null;
	ctaLink: string | null;
	targetPlan: string | null;
	deadline: Date | null;
	scheduledFor: Date;
	impressions: number;
	clicks: number;
	conversions: number;
}

export class AdRepository {
	async findByMonth(userId: string, month: number, year: number) {
		const startDate = new Date(year, month - 1, 1);
		const endDate = new Date(year, month, 0);

		return db
			.select()
			.from(events)
			.where(
				and(
					eq(events.ownerId, userId),
					sql`${events.title} LIKE '📢%'`,
					gte(events.start, startDate.toISOString()),
					lte(events.start, endDate.toISOString())
				)
			)
			.orderBy(asc(events.start));
	}

	async insert(eventData: {
		id: string;
		calendarId: string;
		ownerId: string;
		title: string;
		start: string;
		end: string;
		description: string;
	}) {
		const [adEvent] = await db.insert(events).values(eventData).returning();
		return adEvent;
	}

	async insertAdRecord(data: {
		sponsorName: string;
		message: string;
		ctaText: string | null;
		ctaLink: string | null;
		targetPlan: string | null;
		deadline: Date | null;
		scheduledFor: Date;
	}) {
		const [record] = await db.insert(adEvents).values({
			id: generateId(15),
			...data,
			impressions: 0,
			clicks: 0,
			conversions: 0
		}).returning();
		return record;
	}

	async incrementImpression(adEventId: string): Promise<void> {
		await db
			.update(adEvents)
			.set({ impressions: sql`${adEvents.impressions} + 1` })
			.where(eq(adEvents.id, adEventId));
	}

	async incrementClick(adEventId: string): Promise<void> {
		await db
			.update(adEvents)
			.set({ clicks: sql`${adEvents.clicks} + 1` })
			.where(eq(adEvents.id, adEventId));
	}
}
