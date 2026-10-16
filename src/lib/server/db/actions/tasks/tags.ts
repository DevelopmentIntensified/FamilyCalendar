// Task tag fan-out (issue #113): normalization plus batched attachment.

import { inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { taskTags } from '$lib/server/db/schema';


/** True for usable tag name strings. */
function isTagName(t: unknown): t is string {
	return typeof t === 'string';
}

/** Normalize raw tag input: lowercase, trim, drop empties, dedupe, sort. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
export function normalizeTags(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const t of raw) {
		if (!isTagName(t)) continue;
		const name = t.trim().toLowerCase();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		out.push(name);
	}
	return out.sort();
}

/** Fan `tags` out onto a list of task rows by id (id stays a string in both). */
// Not part of the public barrel: list queries and tag-editing mutations attach tags through it.
export async function attachTags(rows: { id: string }[]): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	if (rows.length === 0) return map;
	const ids = rows.map((r) => r.id);
	if (ids.length === 0) return map;
	const tagRows = await db.select().from(taskTags).where(inArray(taskTags.taskId, ids));
	for (const tr of tagRows) {
		const key = String(tr.taskId);
		const list = map.get(key) ?? [];
		list.push(tr.name);
		map.set(key, list);
	}
	for (const list of map.values()) list.sort();
	return map;
}
/** Attach tag names to typed section rows (not part of the public barrel). */
export async function withTags<T extends { id: string }>(rows: T[]): Promise<(T & { tags: string[] })[]> {
	const tagMap = await attachTags(rows);
	return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}
