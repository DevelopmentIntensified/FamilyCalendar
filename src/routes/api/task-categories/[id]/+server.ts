import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import {
	deleteTaskCategory,
	parseCategoryName,
	renameTaskCategory,
	toCategoryDto
} from '$lib/server/db/actions/taskCategories';
import { requireUserJson } from '$lib/server/utils/requireUser';

/**
 * One task category (#280). Only the caller's own rows; anything else 404s.
 *
 *   PATCH  /api/task-categories/[id] {name} -> 200 {category}; 409 name clash
 *          (renames the caller's tasks — owned or assigned — carrying the old name)
 *   DELETE /api/task-categories/[id]        -> 200 {success:true}
 *          (the caller's tasks carrying the name -> category null)
 */
export type TaskCategoryDeps = {
	renameTaskCategory: typeof renameTaskCategory;
	deleteTaskCategory: typeof deleteTaskCategory;
};

const defaultDeps: TaskCategoryDeps = { renameTaskCategory, deleteTaskCategory };

const notFound = () => json({ error: 'Category not found' }, { status: 404 });

export const PATCH = async (event: RequestEvent, deps: TaskCategoryDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const body: unknown = await event.request.json().catch(() => null);
	const name = parseCategoryName(
		typeof body === 'object' && body !== null && 'name' in body ? body.name : undefined
	);
	if (!name.ok) return json({ error: name.error }, { status: 400 });

	const result = await deps.renameTaskCategory(auth.user.id, event.params.id, name.value);
	if (result.status === 'not_found') return notFound();
	if (result.status === 'conflict') {
		return json({ error: 'A category with that name already exists' }, { status: 409 });
	}
	return json({ category: toCategoryDto(result.category) });
};

export const DELETE = async (event: RequestEvent, deps: TaskCategoryDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	if (!(await deps.deleteTaskCategory(auth.user.id, event.params.id))) return notFound();
	return json({ success: true });
};
