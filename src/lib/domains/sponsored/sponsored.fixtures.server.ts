/**
 * Row builders for sponsored's db tests: the settings row the gate reads, an
 * own 📢 Event the month read serves, an `adEvents` row retention prunes and a
 * consent record — in one home, so a schema change updates one file. Kernel
 * seeds only users.
 *
 * The settings and the Event are other modules' rows (`identity`, `calendar`),
 * so their builders carry the module noun; the two tables this module owns
 * keep their plain names. Timestamps stay the column defaults unless a test
 * overrides them.
 *
 * Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import {
	adConsentRecords,
	adEvents,
	events,
	userSettings,
	type AdConsentRecordRow,
	type AdEventRow,
	type EventRow,
	type NewAdConsentRecordRow,
	type NewAdEventRow,
	type NewEventRow,
	type NewUserSettingsRow,
	type UserSettingsRow
} from '$lib/kernel/db/tables.server';

/** The settings row the gate reads: opted in, `UTC`, so a month window never depends on the host zone. */
export async function seedSponsoredSettings(
	db: Db,
	userId: string,
	overrides: Partial<NewUserSettingsRow> = {}
): Promise<UserSettingsRow> {
	const [row] = await db
		.insert(userSettings)
		.values({ showAdsAsEvents: true, timeZone: 'UTC', ...overrides, userId })
		.returning();
	if (!row) throw new Error('seedSponsoredSettings: insert returned no row');
	return row;
}

/**
 * An Event the user owns, titled with the 📢 marker unless overridden. Not
 * all-day on purpose: every served Sponsored Event is projected as all-day.
 */
export async function seedOwnedSponsoredEvent(
	db: Db,
	seed: Pick<NewEventRow, 'ownerId' | 'start'> & Partial<NewEventRow>
): Promise<EventRow> {
	const [row] = await db
		.insert(events)
		.values({ title: '📢 Sale', allDay: false, ...seed })
		.returning();
	if (!row) throw new Error('seedOwnedSponsoredEvent: insert returned no row');
	return row;
}

/** One `adEvents` row (legacy `injectAdEvent`'s shape, a real template's fields). */
export async function seedAdEvent(
	db: Db,
	overrides: Partial<NewAdEventRow> = {}
): Promise<AdEventRow> {
	const [row] = await db
		.insert(adEvents)
		.values({
			sponsorName: 'Family Calendar',
			message: 'Get 20% off annual plans this month only!',
			ctaText: 'Claim Discount',
			ctaLink: '/pricing',
			targetPlan: 'annual',
			scheduledFor: new Date('2026-11-05T10:00:00.000Z'),
			...overrides
		})
		.returning();
	if (!row) throw new Error('seedAdEvent: insert returned no row');
	return row;
}

/** One consent record; `granted` unless overridden. */
export async function seedAdConsentRecord(
	db: Db,
	seed: Pick<NewAdConsentRecordRow, 'userId'> & Partial<NewAdConsentRecordRow>
): Promise<AdConsentRecordRow> {
	const [row] = await db
		.insert(adConsentRecords)
		.values({ decision: 'granted', ...seed })
		.returning();
	if (!row) throw new Error('seedAdConsentRecord: insert returned no row');
	return row;
}
