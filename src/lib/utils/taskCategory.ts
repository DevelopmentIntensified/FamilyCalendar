/** Task categories (#280): pure helpers shared by the editor, the add card
 * and the manage-list section. Server contract: ≤80 chars, trimmed, blank →
 * null; names unique per user case-insensitively. */

export const CATEGORY_MAX = 80;

export interface CategoryItem {
	id: string;
	name: string;
}

/** Form input → wire value: trimmed, blank → null. */
export function normalizeCategoryInput(raw: string): string | null {
	const v = raw.trim();
	return v ? v : null;
}

/** Client-side guard mirroring the server's 400s, for inline feedback. */
export function categoryNameError(raw: string): string | null {
	const v = raw.trim();
	if (!v) return 'Name is required';
	if (v.length > CATEGORY_MAX) return `Keep it to ${CATEGORY_MAX} characters`;
	return null;
}

function byName(a: CategoryItem, b: CategoryItem): number {
	return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** Optimistic rename: new array, name-sorted like GET /api/task-categories. */
export function renameInList<T extends CategoryItem>(list: T[], id: string, name: string): T[] {
	return list.map((c) => (c.id === id ? { ...c, name } : c)).sort(byName);
}

/** Optimistic delete: new array without that id. */
export function removeFromList<T extends CategoryItem>(list: T[], id: string): T[] {
	return list.filter((c) => c.id !== id);
}
