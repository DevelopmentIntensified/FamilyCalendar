/**
 * familyHub service: the two pages' read models, composed from the domain
 * services and owning no SQL of its own (rule R3 — a screen has no tables).
 *
 * - `getFamilyHub` is `family`'s detail read (`getFamily`): the family, the
 *   roster, the viewer's role, Recent Activity, the module switches, the live
 *   invite and the plan usage, with a non-member and a missing family sharing
 *   one `404 Family not found` (legacy `loadFamilyDetail`). The composition
 *   lives in `family` because `GET /api/families/{id}` serves the same payload;
 *   this screen re-exports its answer under the page's model type.
 * - `getFamilyBoard` is the board read: the viewer's family (named, else the
 *   OLDEST — issue 098), the family's Tasks, the members' public personal
 *   ones, the roster and the editor's categories. The page load windows the
 *   completed rows (Q-091); the `/api` twin passes no limit and keeps every
 *   row.
 *
 * Reads run in parallel after the membership list has picked the family, so a
 * caller outside it never reaches a second read (and so never sees the roster's
 * different refusal copy).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import {
	getFamily,
	listFamilyRoster,
	listPersonFamilyIds,
	type FamilyDetailCtx
} from '$lib/domains/family/index.server';
import { listFamilyTasks, listTaskCategories } from '$lib/domains/tasks/index.server';
import type {
	BoardCategoryResponse,
	FamilyBoardModel,
	FamilyBoardTask,
	FamilyHubModel
} from './familyHub.contract';
import { windowCompletedTasks } from './familyHub.board.rules';

/**
 * The ctx the detail read needs: `family`'s five ports plus identity's two
 * (the viewer's hidden modules live in their settings row). The app attaches
 * all of them to every request ctx in `src/lib/app/ports.server.ts`.
 */
export type FamilyHubCtx = FamilyDetailCtx;

/** The one input of the detail read. */
export type FamilyHubInput = {
	readonly familyId: string;
};

/**
 * The detail page's data. Throws `404 Family not found` for a non-member and a
 * missing family alike (issue 064) — the caller renders neither a page whose
 * family links read `undefined`, nor a probeable id.
 */
export async function getFamilyHub(
	ctx: FamilyHubCtx,
	actor: Actor,
	input: FamilyHubInput
): Promise<FamilyHubModel> {
	// The cast is the contract check: `family`'s answer must stay assignable to
	// the page model, so a column added or renamed on either side fails here
	// instead of in a component.
	const model: FamilyHubModel = await getFamily(ctx, actor, input.familyId);
	return model;
}

/** What the board read was asked for. */
export type FamilyBoardInput = {
	/** The family the URL named (`?familyId=`), or null for "the oldest". */
	readonly requested: string | null;
	/**
	 * Q-091: how many completed Tasks the page keeps, in the read's own order.
	 * `null`/absent keeps every row — the `/api` twin's answer.
	 */
	readonly completedLimit?: number | null;
};

/**
 * The board page's data, or `null` when the viewer belongs to no family (the
 * page redirects to `/family`; the `/api` twin answers 404 because its id can
 * never match).
 *
 * The family is chosen exactly as legacy `loadFamilyTasks` chose it: the
 * requested id when the viewer belongs to it, otherwise the OLDEST family
 * (`listPersonFamilyIds` is oldest-first, issue 098). The tasks' `familyId` is
 * then the board's own answer, so a caller that needs exactly the requested
 * family compares the two.
 */
export async function getFamilyBoard(
	ctx: Ctx,
	actor: Actor,
	input: FamilyBoardInput
): Promise<FamilyBoardModel | null> {
	const familyIds = await listPersonFamilyIds(ctx, actor.id);
	const familyId =
		(input.requested ? familyIds.find((id) => id === input.requested) : undefined) ??
		familyIds[0] ??
		null;
	if (!familyId) return null;

	// Only after membership is known: `tasks` answers the board's one 404, and
	// `family` its roster 403, so neither read runs for a family the viewer
	// cannot address.
	const [board, roster, taskCategories] = await Promise.all([
		listFamilyTasks(ctx, actor, { familyId }),
		listFamilyRoster(ctx, actor, familyId),
		categoryOptions(ctx, actor)
	]);

	// The compile-time bridge: `tasks`' section row is the board row before
	// serialisation, so a column added there flows through without a cast.
	const familyTasks: readonly FamilyBoardTask[] = board.familyTasks;

	return {
		familyId,
		userId: actor.id,
		...windowCompletedTasks(familyTasks, input.completedLimit ?? null),
		publicTasks: board.publicTasks,
		familyRoster: roster.members.map((member) => ({
			userId: member.userId,
			firstName: member.firstName,
			lastName: member.lastName,
			email: member.email,
			role: member.role,
			memberType: member.memberType
		})),
		taskCategories
	};
}

/**
 * The viewer's own category options, `{id, name}` only. A failed read yields
 * no suggestions instead of failing the board (legacy `listCategoryOptions`
 * logged and answered `[]`; the golden cannot make the read fail, so
 * `familyHub.service.db.test.ts` drives this seam).
 */
async function categoryOptions(ctx: Ctx, actor: Actor): Promise<BoardCategoryResponse[]> {
	try {
		const categories = await listTaskCategories(ctx, actor);
		return categories.map((category) => ({ id: category.id, name: category.name }));
	} catch (error) {
		ctx.log.error('family_hub.task_categories_read_failed', {
			error: error instanceof Error ? error.message : String(error)
		});
		return [];
	}
}
