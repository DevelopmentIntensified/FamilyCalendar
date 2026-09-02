import { db } from '$lib/server/db';
import { unmatchedPhrases, type UnmatchedPhrase } from '$lib/server/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

export type UnmatchedSource = 'event_parse' | 'bulk_edit';

/** Normalize a phrase for dedup: lowercase, collapse whitespace, trim. */
export function normalizePhrase(phrase: string): string {
	return phrase.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 280);
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
	const normalized = normalizePhrase(phrase);
	if (!normalized) return;
	try {
		const values: Record<string, unknown> = { source, phrase: normalized, sample: normalized };
		if (matched) values.matched = JSON.stringify(matched);
		await db
			.insert(unmatchedPhrases)
			.values(values)
			.onConflictDoUpdate({
				target: [unmatchedPhrases.source, unmatchedPhrases.phrase],
				set: { count: sql`${unmatchedPhrases.count} + 1` }
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
