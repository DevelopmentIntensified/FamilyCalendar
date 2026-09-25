import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { itemTags, type BillCategory, type ItemTag } from '$lib/server/db/schema';

/**
 * Tag Table (issue 031) — the learning store behind category suggestions.
 * Three mappings live in one table: merchant → category, item → category,
 * and (merchant, store-SKU) → name + category for code-only receipts.
 * One row per (scope, key, category) with a weight; prediction is the
 * highest-weight row, USER rows override GLOBAL rows (userId null).
 *
 * Query shape is fixed at TWO indexed batched lookups per prediction
 * (user rows via inArray, global rows via inArray) — O(log n) at any
 * scale; the 1000-row perf test pins this.
 */

/** Stored keys are capped so hostile labels cannot bloat the index. */
export const MAX_TAG_KEY_LENGTH = 120;
/** Item labels, SKU codes, and learned names share this input cap. */
export const MAX_TAG_NAME_LENGTH = 100;

/**
 * Normalizes a merchant or item label into a Tag Table key: lowercase,
 * trimmed, punctuation runs collapsed to single spaces, whitespace
 * collapsed, hard-capped. Idempotent by construction.
 */
export function normalizeTagKey(raw: string): string {
	return raw
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.trim()
		.replace(/\s+/g, ' ')
		.slice(0, MAX_TAG_KEY_LENGTH)
		.trim();
}

/** True when a label is a bare numeric code (a store SKU candidate). */
export function isBareCodeLabel(label: string): boolean {
	return /^\d{3,24}$/.test(label.trim());
}

/**
 * Item key for a label under a merchant. Plain labels normalize to
 * themselves; bare numeric codes become the (merchant, sku) composite key
 * — space-joined so the result is normalizeTagKey-stable.
 */
export function deriveItemKey(merchantKey: string, label: string): string {
	const merchant = normalizeTagKey(merchantKey);
	const item = normalizeTagKey(label);
	return isBareCodeLabel(label) ? `${merchant} ${item}`.trim() : item;
}

/** One predicted category with where it came from (for suggestion badges). */
export interface TagPrediction {
	category: BillCategory;
	source: 'user' | 'global';
	/** Learned item name (code-only SKUs); null when unlabeled. */
	name: string | null;
}

/** Prediction result for one merchant + its item keys. */
export interface TagPredictions {
	merchant: TagPrediction | null;
	/** Keyed by DERIVED item key (see deriveItemKey). */
	items: Record<string, TagPrediction | null>;
}

/**
 * Batched 2-query lookup: the user's rows for all keys, then the global
 * rows. Precedence per key: user row → global majority (highest weight) →
 * null (caller falls back to keyword heuristics). Item keys are derived
 * from the merchant so store SKUs land on the (merchant, sku) key.
 */
export async function predictCategory(
	keys: { merchant?: string | null; itemKeys: string[] },
	userId: string
): Promise<TagPredictions> {
	const merchantKey = keys.merchant ? normalizeTagKey(keys.merchant) : null;
	const derivedKeys = keys.itemKeys.map((label) => deriveItemKey(merchantKey ?? '', label));
	const lookupKeys = [...new Set(merchantKey ? [merchantKey, ...derivedKeys] : derivedKeys)];

	if (lookupKeys.length === 0) return { merchant: null, items: {} };

	// Query 1: the user's own rows. Query 2: the global rows.
	const userRows = await db
		.select()
		.from(itemTags)
		.where(and(inArray(itemTags.key, lookupKeys), eq(itemTags.userId, userId)));
	const globalRows = await db
		.select()
		.from(itemTags)
		.where(and(inArray(itemTags.key, lookupKeys), isNull(itemTags.userId)));

	const best = (rows: ItemTag[], source: TagPrediction['source']): TagPrediction | null => {
		let winner: ItemTag | null = null;
		for (const row of rows) {
			if (!winner || row.weight > winner.weight) winner = row;
		}
		return winner
			? // SAFETY: category is a BILL_CATEGORIES literal, written only by
				// trainTagTable from validated inputs; the DB text column widens
				// the type back to string on read.
				{ category: winner.category as BillCategory, source, name: winner.name }
			: null;
	};

	const byKey = (rows: ItemTag[]): Map<string, ItemTag[]> => {
		const grouped = new Map<string, ItemTag[]>();
		for (const row of rows) {
			const list = grouped.get(row.key) ?? [];
			list.push(row);
			grouped.set(row.key, list);
		}
		return grouped;
	};

	const userByKey = byKey(userRows);
	const globalByKey = byKey(globalRows);

	const resolve = (key: string): TagPrediction | null =>
		userByKey.has(key)
			? best(userByKey.get(key) ?? [], 'user')
			: globalByKey.has(key)
				? best(globalByKey.get(key) ?? [], 'global')
				: null;

	const items: Record<string, TagPrediction | null> = {};
	for (const key of derivedKeys) items[key] = resolve(key);

	return { merchant: merchantKey ? resolve(merchantKey) : null, items };
}

/** One labeled entry to train: a derived key, the chosen category, and an
 * optional learned name (code-only SKUs). */
export interface TagTableEntry {
	key: string;
	category: BillCategory;
	name?: string | null;
}

/** Upsert row shape: one per (scope, key, category); weight starts at 1. */
interface TagUpsertRow {
	userId: string | null;
	key: string;
	category: string;
	name: string | null;
}

/**
 * Learning loop — retrains on EVERY save (not just first-time labels).
 * Single transaction: user rows (weight+1, the user's choice) AND global
 * rows (weight+1). Rows are one-per-(scope, key, category); the chosen
 * category's row absorbs the increment, so prediction = max weight.
 * 'other' still trains — weight builds popularity data for curation.
 */
export async function trainTagTable(
	userId: string,
	merchantKey: string,
	merchantCategory: BillCategory,
	entries: TagTableEntry[]
): Promise<void> {
	if (entries.length === 0) return;

	// Dedupe by key (last category wins — the most recent intent), with
	// learned names retained. Merchant key rides along as its own entry.
	const rows = new Map<string, TagUpsertRow>();
	const upsert = (key: string, category: string, name: string | null) => {
		rows.set(key, { userId: 'USER', key, category, name });
	};
	upsert(normalizeTagKey(merchantKey), merchantCategory, null);
	for (const entry of entries) {
		upsert(deriveItemKey(merchantKey, entry.key), entry.category, entry.name ?? null);
	}

	const userRows: TagUpsertRow[] = [];
	const globalRows: TagUpsertRow[] = [];
	for (const row of rows.values()) {
		userRows.push({ ...row, userId });
		globalRows.push({ ...row, userId: null });
	}

	// Weight upserts increment; names only fill in, never blank out.
	const setClause = {
		weight: sql`${itemTags.weight} + 1`,
		name: sql`coalesce(excluded.name, ${itemTags.name})`,
		updatedAt: new Date()
	};

	await db.transaction(async (tx) => {
		await tx
			.insert(itemTags)
			.values(userRows)
			.onConflictDoUpdate({
				target: [itemTags.userId, itemTags.key, itemTags.category],
				set: setClause
			});
		// Global rows: userId is NULL and Postgres unique treats NULLs as
		// distinct, so this targets the partial (key, category) index.
		await tx
			.insert(itemTags)
			.values(globalRows)
			.onConflictDoUpdate({
				target: [itemTags.key, itemTags.category],
				targetWhere: sql`${itemTags.userId} IS NULL`,
				set: setClause
			});
	});
}

/**
 * Preloaded suggestion lists for the bills UI (top-N by weight, user and
 * global scopes; rendered into a native <datalist>, never per keystroke).
 */
export async function topTags(
	userId: string,
	limit = 50
): Promise<{ user: ItemTag[]; global: ItemTag[] }> {
	const user = await db
		.select()
		.from(itemTags)
		.where(eq(itemTags.userId, userId))
		.orderBy(desc(itemTags.weight))
		.limit(limit);
	const global = await db
		.select()
		.from(itemTags)
		.where(isNull(itemTags.userId))
		.orderBy(desc(itemTags.weight))
		.limit(limit);
	return { user, global };
}
