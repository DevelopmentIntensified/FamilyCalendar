/**
 * tasks http: the `/api` read/create handlers — `GET|POST /api/tasks`,
 * `GET /api/tasks/sections`, `DELETE /api/tasks/completed`, the
 * `/api/task-categories` CRUD and `GET /api/stats`.
 *
 * The stem is frozen by `tasks.http.db.test.ts` (R13), which imports the route
 * files and pins status + body of every one of them. Reproduces the legacy wire
 * exactly — auth mode, statuses, bodies, error copy — with no SQL and no rules:
 * the services own both.
 *
 * Two legacy body quirks are kept on purpose, each pinned by that golden:
 * - the category routes read `request.json().catch(() => null)`, so a malformed
 *   body answers `name is required` (lenient body mode), never the kernel's
 *   `Invalid JSON`;
 * - `POST /api/tasks` answers `Title is required` for a non-object body, which
 *   is what legacy's `body.title` read produced.
 *
 * Doc: ./README.md#public-interface
 */
import { created, endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { listFamilyRoster, resolveMembershipFamilyId } from '$lib/domains/family/index.server';
import { getTimeZone } from '$lib/domains/identity/index.server';
import {
	addTaskCategory,
	listTaskCategories,
	removeTaskCategory,
	renameTaskCategory
} from './tasks.categories.service.server';
import { TaskCategoryNameBody, TaskCreateBody } from './tasks.contract';
import {
	clearCompletedTasks,
	createTask,
	listTasks,
	listTaskSections
} from './tasks.items.service.server';
import { getStatsPage } from './tasks.stats.service.server';

// --- Tasks --------------------------------------------------------------------

/**
 * `GET /api/tasks`: the caller's list, or the parent Event's rows for
 * `?eventId=`, both on the ONE list shape (Q-055). `listTasks` owns the pin,
 * tags, attribution, the private read rule and the phone overlay; an unknown
 * Event is `200 {tasks:[]}`, an unreadable one `403 No access to this event`.
 */
export const listTasksEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor, event }) =>
		ok({
			tasks: await listTasks(ctx, actor, { eventId: event.url.searchParams.get('eventId') })
		})
});

/** `POST /api/tasks`: 201 `{success, task}`, or the route's own 500 copy. */
export const createTaskEndpoint = endpoint({
	auth: 'user',
	body: TaskCreateBody,
	// Legacy read properties off the parsed body, so a non-object body was
	// `Title is required`; this mode hands the schema that same answer.
	bodyMode: 'lenient',
	failMessage: 'Failed to create task',
	handle: async ({ ctx, actor, body }) =>
		created({ success: true, task: await createTask(ctx, actor, body) })
});

/** `GET /api/tasks/sections`: the three queues plus the labels of failed legs. */
export const taskSectionsEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => ok(await listTaskSections(ctx, actor))
});

/** `DELETE /api/tasks/completed`: archives the caller's own completed rows. */
export const clearCompletedTasksEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => {
		await clearCompletedTasks(ctx, actor);
		return ok({ success: true });
	}
});

// --- Task categories ----------------------------------------------------------

/** `GET /api/task-categories`: name-sorted case-insensitively, ISO stamps. */
export const listTaskCategoriesEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => ok({ categories: await listTaskCategories(ctx, actor) })
});

/** `POST /api/task-categories {name}`: idempotent, keeps the list's spelling. */
export const createTaskCategoryEndpoint = endpoint({
	auth: 'user',
	body: TaskCategoryNameBody,
	bodyMode: 'lenient',
	handle: async ({ ctx, actor, body }) =>
		ok({ category: await addTaskCategory(ctx, actor, { name: body.name }) })
});

/** `PATCH /api/task-categories/[id] {name}`: 409 on a clash, 404 on a foreign id. */
export const renameTaskCategoryEndpoint = endpoint({
	auth: 'user',
	body: TaskCategoryNameBody,
	bodyMode: 'lenient',
	handle: async ({ ctx, actor, body, event }) =>
		ok({
			category: await renameTaskCategory(ctx, actor, {
				categoryId: event.params.id ?? '',
				name: body.name
			})
		})
});

/** `DELETE /api/task-categories/[id]`: deletes and clears the caller's Tasks. */
export const deleteTaskCategoryEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor, event }) => {
		await removeTaskCategory(ctx, actor, { categoryId: event.params.id ?? '' });
		return ok({ success: true });
	}
});

// --- Stats --------------------------------------------------------------------

/** `GET /api/stats`: the counting path, streak, instants, today and the roster. */
export const taskStatsEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => ok(await getStatsPage(ctx, actor))
});

// --- Page ----------------------------------------------------------------

/**
 * `GET /calendar/tasks`'s load: the three queues, the viewer's categories, the
 * family roster and the stored zone the quick-add resolves dates in. The group
 * layout still supplies `user`, `familyId` and the roster for other pages; this
 * page reads them here so its data comes from the module's own services.
 */
export const tasksPageLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor }) => {
		const familyId = await resolveMembershipFamilyId(ctx, actor.id);
		const [sections, categories, roster, timeZone] = await Promise.all([
			listTaskSections(ctx, actor),
			listTaskCategories(ctx, actor),
			listFamilyRoster(ctx, actor, familyId),
			getTimeZone(ctx, actor.id)
		]);
		return {
			user: { id: actor.id },
			userSettings: { timeZone: timeZone ?? 'UTC' },
			familyId,
			familyMembers: roster.members.map((member) => ({
				userId: member.userId,
				firstName: member.firstName ?? '',
				lastName: member.lastName ?? ''
			})),
			taskCategories: categories.map(({ id, name }) => ({ id, name })),
			taskLists: sections,
			loadWarnings: [] as string[]
		};
	}
});
