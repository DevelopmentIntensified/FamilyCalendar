/**
 * sponsored repo: the consent trail's append and read, the dev seed's ad rows,
 * and `adEvents` retention.
 *
 * Each function takes `db: Db` first, contains no authorization and no
 * business rules (the gate, the month, the draw and the projection live in the
 * `*.rules.ts` files), and touches only this module's two tables — no foreign
 * read (owner Q-040 B dropped the `events` read with the own-📢 rule). Nothing
 * here reads the process clock (rule R5): the consent append takes its
 * `recordedAt`, the prune its cutoff.
 *
 * Deliberately absent (sheet › Notes): the engagement write and the target-plan
 * report. `adEvents`' only writer is the dev seed's insert-if-absent, and no
 * route exposes a counter.
 *
 * Doc: ./README.md#invariants
 */
import { desc, eq, lt } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import {
	adConsentRecords,
	adEvents,
	type AdConsentRecordRow,
	type NewAdEventRow
} from '$lib/kernel/db/tables.server';
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
 * Write the dev seed's demo ad rows, keeping any id that already exists (the
 * legacy seed's `.onConflictDoNothing()`, so re-running changes nothing), and
 * answer how many rows were new. `createdAt` stays the column default: the
 * rows' ages are real, like the legacy seed's, and the prune anchors on it.
 */
export async function insertAdEventsIfAbsent(
	db: Db,
	rows: readonly NewAdEventRow[]
): Promise<number> {
	if (rows.length === 0) return 0;
	const inserted = await db
		.insert(adEvents)
		.values(rows.map((row) => ({ ...row })))
		.onConflictDoNothing()
		.returning({ id: adEvents.id });
	return inserted.length;
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
