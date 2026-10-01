import { db } from '$lib/server/db';
import { adConsentRecords, type AdConsentDecision } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';

/**
 * Ad consent records — the evidence trail beside the ad gate (#088).
 *
 * `userSettings.showAdsAsEvents` remains the single serve-time gate; see
 * `shouldServeAds` in the ad service. Nothing in this module is called on the
 * read path, so a record can never change whether an ad renders. This exists
 * only to answer two questions a current boolean cannot:
 *
 *   - "prove I consented"  → a `granted` row exists, with a timestamp
 *   - "when did they withdraw" → the latest `withdrawn` row, with a timestamp
 *
 * One row per consent EVENT, written when the setting changes. A row written
 * on every read would be a serve log, not consent, and would drown the two
 * questions above in noise.
 */

/**
 * The decision a change records, or null when there is no event.
 *
 * Pure, so the transition rule is pinned without a database. A null return
 * means "append nothing" — in particular a user who has never touched the
 * setting and saves the form with ads off records nothing: they were never
 * asked, so a "declined" row would be a fabricated consent record.
 */
export function adConsentDecisionFor(
	previous: boolean | null | undefined,
	next: boolean
): AdConsentDecision | null {
	const wasGranted = previous === true;
	if (wasGranted === next) return null;
	return next ? 'granted' : 'withdrawn';
}

/**
 * Append one consent record if — and only if — the setting actually changed.
 * Returns the decision recorded, or null when nothing was written.
 *
 * Call this with the value the setting held BEFORE the save, so an unchanged
 * save (the common case: the user edited some other preference) is a no-op.
 */
export async function recordAdConsentChange(
	userId: string,
	previous: boolean | null | undefined,
	next: boolean
): Promise<AdConsentDecision | null> {
	const decision = adConsentDecisionFor(previous, next);
	if (!decision) return null;

	await db.insert(adConsentRecords).values({ userId, decision });
	return decision;
}

/** This user's consent history, newest first — the privacy-request read. */
export async function getAdConsentRecords(userId: string) {
	return await db
		.select()
		.from(adConsentRecords)
		.where(eq(adConsentRecords.userId, userId))
		.orderBy(desc(adConsentRecords.recordedAt));
}
