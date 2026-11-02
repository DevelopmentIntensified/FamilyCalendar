import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import {
	ensureTaskCategory,
	listTaskCategories,
	parseCategoryName,
	toCategoryDto
} from '$lib/server/db/actions/taskCategories';
import { requireUserJson } from '$lib/server/utils/requireUser';

/**
 * Task categories (#280), synced by name with TaskFocus. Same auth as
 * /api/tasks: Bearer fp_ token (resolved in hooks) or session cookie.
 *
 *   GET  /api/task-categories          -> 200 {categories:[{id,name,createdAt,updatedAt}]}
 *   POST /api/task-categories {name}   -> 200 {category}  (idempotent, case-insensitive)
 */
export type TaskCategoriesDeps = {
	listTaskCategories: typeof listTaskCategories;
	ensureTaskCategory: typeof ensureTaskCategory;
};

const defaultDeps: TaskCategoriesDeps = { listTaskCategories, ensureTaskCategory };

export const GET = async (event: RequestEvent, deps: TaskCategoriesDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const rows = await deps.listTaskCategories(auth.user.id);
	return json({ categories: rows.map(toCategoryDto) });
};

export const POST = async (event: RequestEvent, deps: TaskCategoriesDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const body: unknown = await event.request.json().catch(() => null);
	const name = parseCategoryName(
		typeof body === 'object' && body !== null && 'name' in body ? body.name : undefined
	);
	if (!name.ok) return json({ error: name.error }, { status: 400 });

	const row = await deps.ensureTaskCategory(auth.user.id, name.value);
	return json({ category: toCategoryDto(row) });
};
