/**
 * sponsored repo: the consent trail's append and read, and `adEvents`
 * retention.
 *
 * Each function takes `db: Db` first, contains no authorization and no
 * business rules (the gate, the month, the draw and the projection live in the
 * `*.rules.ts` files), and touches only this module's two tables — no foreign
 * read (owner Q-040 B dropped the `events` read with the own-📢 rule). Nothing
 * here reads the process clock (rule R5): the consent append takes its
 * `recordedAt`, the prune its cutoff.
 *
 * Deliberately absent (sheet › Notes): the impression/click counters and the
 * target-plan report — `adEvents` has no writer, so neither has a consumer.
 *
 * Doc: ./README.md#invariants
 */
import { desc, eq, lt } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import { adConsentRecords, adEvents, type AdConsentRecordRow } from '$lib/kernel/db/tables.server';
import type { SponsoredConsentDecision } from './sponsored.contract';

/** One consent event to append; `recordedAt` is the caller's `now`. */
export type SponsoredConsentRecordWrite = {
	readonly userId: string;
	readonly decision: SponsoredConsentDecision;
	readonly recordedAt: Date;
};

/** Append one consent record (the trail is append-only) and return it as stored. */
export async function insertSponsoredConsentRecord(
	db: Db,
	record: SponsoredConsentRecordWrite
): Promise<AdConsentRecordRow> {
	const [row] = await db
		.insert(adConsentRecords)
		.values({ userId: record.userId, decision: record.decision, recordedAt: record.recordedAt })
		.returning();
	if (!row) throw new Error('insertSponsoredConsentRecord: insert returned no row');
	return row;
}

/** The user's whole consent trail, newest first (`adConsentService.ts:58-64`). */
export async function listSponsoredConsentRecords(
	db: Db,
	userId: string
): Promise<AdConsentRecordRow[]> {
	return await db
		.select()
		.from(adConsentRecords)
		.where(eq(adConsentRecords.userId, userId))
		.orderBy(desc(adConsentRecords.recordedAt));
}

/**
 * Retention: delete the `adEvents` rows created before the cutoff and return
 * how many went. The anchor is `createdAt`, never `scheduledFor`; a row created
 * exactly at the cutoff stays (`adEvents.ts:19-26`).
 */
export async function deleteAdEventsCreatedBefore(db: Db, cutoff: Date): Promise<number> {
	const deleted = await db
		.delete(adEvents)
		.where(lt(adEvents.createdAt, cutoff))
		.returning({ id: adEvents.id });
	return deleted.length;
}
