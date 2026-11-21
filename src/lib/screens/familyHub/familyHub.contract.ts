/**
 * familyHub contract: the zod schemas for the screen's one `/api` twin
 * (`GET /api/families/{id}/tasks`, G11) and the five detail-page form actions.
 *
 * The board body is pinned by `familyHub.http.db.test.ts` and read by Android,
 * so every key, its nullability and the shape of its dates is the wire as the
 * legacy route serialised it, not a cleaner shape:
 * - `dueDate` / `completedAt` / `archivedAt` come from `mode: 'string'`
 *   timestamps, so they reach the wire as Postgres text (`2026-02-01 10:00:00+00`
 *   is legal) — a response date is a string, never a parsed instant.
 * - `createdAt`, `focusStartedAt` and `eventStart` are `Date` columns, which
 *   `json()` serialises as ISO-8601 strings.
 *
 * The task, roster and category rows are the owning domains' shapes (`tasks`'
 * `TaskWire` / `TaskCategoryWire`, `family`'s `RosterMemberResponse`). They are
 * restated here because those modules do not export them from their entries
 * yet; S6 composes them from `tasks`/`family`'s `index.ts` once their S5/S6
 * land, and this file then keeps only the envelope.
 *
 * Doc: ./README.md#invariants
 */
import { z } from '$lib/kernel/validation/validators';

// --- `/api/families/{id}/tasks` (G11) --------------------------------------

/** The `{id}` route parameter: the family the request names, never a fallback. */
export const FamilyBoardParams = z.object({ id: z.string() });
export type FamilyBoardParams = z.infer<typeof FamilyBoardParams>;

/**
 * One Task as the board's two lists carry it: the row's columns plus the
 * attribution and tags the queries attach. `assignmentStatus`, `priority` and
 * `visibility` are the `tasks` vocabulary as stored text; a response never
 * refuses one of its own rows, so they are read as text here (the rules that
 * write them own the closed sets).
 */
export const BoardTaskResponse = z.object({
	id: z.string(),
	title: z.string(),
	notes: z.string().nullable(),
	dueDate: z.string().nullable(),
	completedAt: z.string().nullable(),
	archivedAt: z.string().nullable(),
	recurrenceFrequency: z.string().nullable(),
	recurrenceInterval: z.number().nullable(),
	completionCount: z.number(),
	assignedTo: z.string().nullable(),
	assignmentStatus: z.string().nullable(),
	priority: z.string(),
	visibility: z.string(),
	focusMinutes: z.number().nullable(),
	focusStartedAt: z.string().nullable(),
	category: z.string().nullable(),
	assigneeFirstName: z.string().nullable(),
	assigneeLastName: z.string().nullable(),
	userId: z.string(),
	familyId: z.string().nullable(),
	eventId: z.string().nullable(),
	createdAt: z.string(),
	eventTitle: z.string().nullable(),
	eventStart: z.string().nullable(),
	creatorFirstName: z.string().nullable(),
	tags: z.array(z.string())
});
export type BoardTaskResponse = z.infer<typeof BoardTaskResponse>;

/**
 * One roster row: `role` is the permission (`creator | admin | member`) and
 * `memberType` the profile label (`parent | child | member`) — two separate
 * fields that are never interchangeable. Both are nullable text columns, and
 * an account may have no email, so the wire carries null.
 */
export const BoardRosterRowResponse = z.object({
	userId: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().nullable(),
	role: z.string().nullable(),
	memberType: z.string().nullable()
});
export type BoardRosterRowResponse = z.infer<typeof BoardRosterRowResponse>;

/** One option in the viewer's own category list (the editor's suggestions). */
export const BoardCategoryResponse = z.object({ id: z.string(), name: z.string() });
export type BoardCategoryResponse = z.infer<typeof BoardCategoryResponse>;

/**
 * `GET /api/families/{id}/tasks`: exactly four keys and no envelope —
 * `tasks` (the family's open and completed Family Tasks), `publicTasks`
 * (current members' public personal rows), `familyRoster` and the viewer's
 * `taskCategories`.
 */
export const FamilyBoardResponse = z.object({
	tasks: z.array(BoardTaskResponse),
	publicTasks: z.array(BoardTaskResponse),
	familyRoster: z.array(BoardRosterRowResponse),
	taskCategories: z.array(BoardCategoryResponse)
});
export type FamilyBoardResponse = z.infer<typeof FamilyBoardResponse>;

// --- The detail page's five form actions -----------------------------------

/**
 * A form field as the legacy actions read it (legacy `formString`,
 * `+page.server.ts:47-50`, and the switch's `formData.get('enabled') === 'true'`
 * at `:115`). They used `formData.get(key)`,
 * so: an absent key or a non-string part became `''` (the service then owned
 * the refusal copy — "User ID is required", "Role must be creator, admin, or
 * member"), and a repeated key kept its FIRST value. The schema reproduces
 * that coercion and never refuses a field here; a 400 at this boundary would
 * replace the legacy message.
 */
const formText = z.preprocess((value) => {
	const first = Array.isArray(value) ? value[0] : value;
	return typeof first === 'string' ? first : '';
}, z.string());

/** `removeMember`: the member to remove; empty reaches the service's 400. */
export const RemoveMemberForm = z.object({ userId: formText });
export type RemoveMemberForm = z.infer<typeof RemoveMemberForm>;

/** `updateRole`: the target and the requested role (`creator|admin|member`). */
export const UpdateRoleForm = z.object({ userId: formText, role: formText });
export type UpdateRoleForm = z.infer<typeof UpdateRoleForm>;

/** `setMemberType`: the target and the profile label (`parent|child|member`). */
export const SetMemberTypeForm = z.object({ userId: formText, memberType: formText });
export type SetMemberTypeForm = z.infer<typeof SetMemberTypeForm>;

/**
 * `updateFamily`: both fields are optional-in-effect — an empty name or
 * colour means "unchanged", so an all-empty save is a successful no-op.
 */
export const UpdateFamilyForm = z.object({ name: formText, color: formText });
export type UpdateFamilyForm = z.infer<typeof UpdateFamilyForm>;

/**
 * `toggleDashboardModule`: only the first posted value being the literal
 * `'true'` enables the switch (legacy `formData.get('enabled') === 'true'`);
 * absent, `'false'`, `'on'` and every other value mean off. `module` empty
 * reaches the service's 400.
 */
export const ToggleModuleForm = z.object({
	module: formText,
	enabled: z.preprocess(
		(value) => (Array.isArray(value) ? value[0] : value) === 'true',
		z.boolean()
	)
});
export type ToggleModuleForm = z.infer<typeof ToggleModuleForm>;
