import { db } from '$lib/server/db';
import { unmatchedPhrases, type UnmatchedPhrase } from '$lib/server/db/schema';
import { and, count, desc, eq, sql } from 'drizzle-orm';

export type UnmatchedSource = 'event_parse' | 'bulk_edit';

/** Normalize a phrase for dedup: lowercase, collapse whitespace, trim. */
export function normalizePhrase(phrase: string): string {
	return phrase.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 280);
}

/**
 * Pure shape for the report upsert, unit-tested without a DB. Repeats
 * refresh the match sample so admins always see the latest parse — the
 * count bump alone would leave the first (possibly stale) sample forever.
 */
export function buildUnmatchedReport(
	source: UnmatchedSource,
	phrase: string,
	matched?: Record<string, unknown> | null
): {
	normalized: string;
	values: Record<string, unknown>;
	conflictSet: Record<string, unknown>;
} | null {
	const normalized = normalizePhrase(phrase);
	if (!normalized) return null;
	const values: Record<string, unknown> = { source, phrase: normalized, sample: normalized };
	if (matched) values.matched = JSON.stringify(matched);
	const conflictSet: Record<string, unknown> = {
		count: sql`${unmatchedPhrases.count} + 1`,
		sample: normalized,
		updatedAt: new Date()
	};
	if (matched) conflictSet.matched = JSON.stringify(matched);
	return { normalized, values, conflictSet };
}

/**
 * Record a phrase the parsers could not handle. Upserts on (source, phrase)
 * and bumps the count so admins see frequency. Never throws — reporting
 * must not break the user's request.
 */
export async function reportUnmatchedPhrase(
	source: UnmatchedSource,
	phrase: string,
	matched?: Record<string, unknown> | null
): Promise<void> {
	const built = buildUnmatchedReport(source, phrase, matched);
	if (!built) return;
	try {
		await db
			.insert(unmatchedPhrases)
			.values(built.values)
			.onConflictDoUpdate({
				target: [unmatchedPhrases.source, unmatchedPhrases.phrase],
				set: built.conflictSet
			});
	} catch (error) {
		console.error('Failed to record unmatched phrase:', error);
	}
}

export async function getUnmatchedPhrases(resolved = false): Promise<UnmatchedPhrase[]> {
	return await db
		.select()
		.from(unmatchedPhrases)
		.where(eq(unmatchedPhrases.resolved, resolved))
		.orderBy(desc(unmatchedPhrases.count), desc(unmatchedPhrases.createdAt));
}

export async function resolveUnmatchedPhrase(id: string) {
	const [updated] = await db
		.update(unmatchedPhrases)
		.set({ resolved: true })
		.where(and(eq(unmatchedPhrases.id, id)))
		.returning();
	return updated;
}

/** Open-phrase count for the admin nav badge. */
export async function countOpenUnmatchedPhrases(): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(unmatchedPhrases)
		.where(eq(unmatchedPhrases.resolved, false));
	return row?.n ?? 0;
}
