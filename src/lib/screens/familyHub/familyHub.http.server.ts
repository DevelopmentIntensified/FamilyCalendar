/**
 * familyHub http: the detail page's load and five form actions, the board
 * page's load, the `/api` twin (`GET /api/families/{id}/tasks`, G11) and the
 * redirect loader the deleted per-family board left behind.
 *
 * The route files stay wiring only (rule R8). The page handlers take the
 * kernel's `pageLoad()` / `formAction()`: signed out they redirect to `/login`
 * (a form POST answers the legacy `fail(401, {success:false, error:'Not signed
 * in'})`), and an action refusal keeps the legacy body — `fail(status,
 * {error})` with the service's own sentence, not the kernel's default
 * `success:false` shape.
 *
 * The endpoint reproduces the frozen golden: auth `user`, the `{id}`
 * parameter, `404 Family not found` for a non-member and a missing family
 * alike, and the four-key body with every row (the page load windows completed
 * Tasks, the wire does not). `json()` serialises the two `Date` columns as ISO
 * strings, exactly as the golden pins them.
 *
 * Doc: ./README.md#public-interface
 */
import { isHttpError, isRedirect, error, fail, redirect } from '@sveltejs/kit';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { isAppError, notFound } from '$lib/kernel/errors/appError';
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { formAction, LOGIN_PATH, pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { setFamilyModuleSwitch } from '$lib/domains/dashboardModules/index.server';
import {
	changeMember,
	removeFamilyMember,
	updateFamily,
	type FamilyDetailCtx
} from '$lib/domains/family/index.server';
import {
	FamilyBoardParams,
	RemoveMemberForm,
	SetMemberTypeForm,
	ToggleModuleForm,
	UpdateFamilyForm,
	UpdateRoleForm,
	type FamilyBoardModel,
	type FamilyHubModel
} from './familyHub.contract';
import { getFamilyBoard, getFamilyHub, type FamilyHubCtx } from './familyHub.service.server';

/**
 * Q-091 (owner, 2026-11-12): the page keeps the newest 50 completed Tasks; the
 * heading prints the true count. The `/api` twin passes no limit.
 */
export const FAMILY_BOARD_COMPLETED_LIMIT = 50;

/** Where the viewer lands with no family at all (legacy `loadFamilyTasks` → null). */
const FAMILY_HOME_PATH = '/family';

/** Where the deleted per-family board sends a signed-in bookmark (issue 124). */
const FAMILY_BOARD_PATH = '/family/tasks';

/**
 * The app attaches every module's ports to each request ctx
 * (`src/lib/app/ports.server.ts`); reading through a missing one would be an
 * `undefined` call, so the screen fails loudly instead.
 */
function familyHubCtx(ctx: Ctx): FamilyHubCtx {
	if (
		!('calendar' in ctx) ||
		!('tasks' in ctx) ||
		!('moduleSwitches' in ctx) ||
		!('childAccount' in ctx) ||
		!('inviteLink' in ctx) ||
		!('calendarAccess' in ctx) ||
		!('adConsent' in ctx)
	) {
		throw new Error(
			'familyHub needs family\'s five ports and identity\'s two: src/lib/app/ports.server.ts must attach calendar, tasks, moduleSwitches, childAccount, inviteLink, calendarAccess and adConsent'
		);
	}
	return ctx as unknown as FamilyDetailCtx;
}

/**
 * An action's refusal: the service's `AppError` becomes the legacy
 * `fail(status, {error})` body, and anything else keeps travelling (the kernel
 * logs and files it as the 500 it is).
 */
function refusalOf(cause: unknown) {
	if (!isAppError(cause)) throw cause;
	return fail(cause.status, { error: cause.message });
}

// --- `/family/[familyId]` ----------------------------------------------------

/**
 * `load` for the detail page. A non-member and a missing family are the same
 * `404 Family not found` (issue 064); only an unexpected fault becomes the
 * legacy `500 Could not load this family` — a redirect or SvelteKit error is
 * re-thrown, never flattened into that page.
 */
export const familyHubPageLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor, event }): Promise<FamilyHubModel> => {
		try {
			return await getFamilyHub(familyHubCtx(ctx), actor, {
				familyId: event.params.familyId ?? ''
			});
		} catch (cause) {
			if (isRedirect(cause) || isHttpError(cause)) throw cause;
			if (isAppError(cause)) error(cause.status, cause.message);
			ctx.log.error('family_hub.detail_load_failed', {
				error: cause instanceof Error ? cause.message : String(cause)
			});
			error(500, 'Could not load this family');
		}
	}
});

/**
 * The detail page's five form actions. Each is its own exported `formAction`
 * (the auth audit resolves a route's actions object entry by entry, so an
 * actions object built from imported handlers keeps every level visible). Each
 * answers `{success:true}` on success and the service's `fail(status,
 * {error})` on a refusal; the page re-reads `data` afterwards, so a settled
 * action always shows the new truth.
 *
 * `familyHubActions` is the same five under the page's action names, for tests
 * and callers that want the set.
 */
export const familyHubRemoveMemberAction = formAction({
	auth: 'user',
	form: RemoveMemberForm,
	handle: async ({ ctx, actor, form, event }) => {
		try {
			await removeFamilyMember(familyHubCtx(ctx), actor, {
				familyId: event.params.familyId ?? '',
				userId: form.userId
			});
			return { success: true };
		} catch (cause) {
			return refusalOf(cause);
		}
	}
});

export const familyHubUpdateRoleAction = formAction({
	auth: 'user',
	form: UpdateRoleForm,
	handle: async ({ ctx, actor, form, event }) => {
		try {
			await changeMember(ctx, actor, {
				familyId: event.params.familyId ?? '',
				userId: form.userId,
				role: form.role
			});
			return { success: true };
		} catch (cause) {
			return refusalOf(cause);
		}
	}
});

// Member Type is a profile label ('parent'|'child'|'member'), not a
// permission — and this action is admin-only (decision 7).
export const familyHubSetMemberTypeAction = formAction({
	auth: 'user',
	form: SetMemberTypeForm,
	handle: async ({ ctx, actor, form, event }) => {
		try {
			await changeMember(ctx, actor, {
				familyId: event.params.familyId ?? '',
				userId: form.userId,
				memberType: form.memberType
			});
			return { success: true };
		} catch (cause) {
			return refusalOf(cause);
		}
	}
});

export const familyHubUpdateFamilyAction = formAction({
	auth: 'user',
	form: UpdateFamilyForm,
	handle: async ({ ctx, actor, form, event }) => {
		try {
			await updateFamily(ctx, actor, event.params.familyId ?? '', {
				name: form.name,
				color: form.color
			});
			return { success: true };
		} catch (cause) {
			return refusalOf(cause);
		}
	}
});

export const familyHubToggleModuleAction = formAction({
	auth: 'user',
	form: ToggleModuleForm,
	handle: async ({ ctx, actor, form, event }) => {
		try {
			await setFamilyModuleSwitch(ctx, actor, {
				familyId: event.params.familyId ?? '',
				module: form.module,
				enabled: form.enabled
			});
			return { success: true };
		} catch (cause) {
			return refusalOf(cause);
		}
	}
});

/** The five actions under the page's own names (tests and the route's object). */
export const familyHubActions = {
	removeMember: familyHubRemoveMemberAction,
	updateRole: familyHubUpdateRoleAction,
	setMemberType: familyHubSetMemberTypeAction,
	updateFamily: familyHubUpdateFamilyAction,
	toggleDashboardModule: familyHubToggleModuleAction
};

// --- `/family/[familyId]/tasks` (redirect only) -----------------------------

/**
 * The old per-family board is not a second board (issue 124): signed out it
 * `302`s to `/login`, signed in it `308`s to `/family/tasks`, and no page
 * renders there. 308 because the old path is not coming back.
 */
export const legacyFamilyBoardPathLoad = pageLoad({
	auth: 'optional',
	handle: async ({ actor }) => {
		if (!actor) redirect(302, LOGIN_PATH);
		redirect(308, FAMILY_BOARD_PATH);
	}
});

// --- `/family/tasks` -------------------------------------------------------

/**
 * `load` for the board. `?familyId=` when the viewer belongs to it, otherwise
 * the OLDEST family (issue 098); no family at all `302`s to `/family`. The
 * completed list is windowed here (Q-091) with the true count in the model.
 */
export const familyBoardPageLoad = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor, event }): Promise<FamilyBoardModel> => {
		const board = await getFamilyBoard(ctx, actor, {
			requested: event.url.searchParams.get('familyId'),
			completedLimit: FAMILY_BOARD_COMPLETED_LIMIT
		});
		if (!board) redirect(302, FAMILY_HOME_PATH);
		return board;
	}
});

// --- `GET /api/families/{id}/tasks` (G11) ------------------------------------

/**
 * The board for ONE family, as Android and TaskFocus read it. The id
 * addresses that family and nothing else: a viewer who is not a member gets
 * the missing family's own 404, never the fallback board the page would pick.
 */
export const familyBoardEndpoint = endpoint({
	auth: 'user',
	params: FamilyBoardParams,
	handle: async ({ ctx, actor, params }) => {
		const board = await getFamilyBoard(ctx, actor, { requested: params.id });
		if (!board || board.familyId !== params.id) throw notFound('Family not found');
		// Exactly the golden's four keys: the model also carries `familyId`,
		// `userId` and `completedTotal` for the page, and the wire never grows.
		const response: Pick<
			FamilyBoardModel,
			'tasks' | 'publicTasks' | 'familyRoster' | 'taskCategories'
		> = {
			tasks: board.tasks,
			publicTasks: board.publicTasks,
			familyRoster: board.familyRoster,
			taskCategories: board.taskCategories
		};
		return ok(response);
	}
});
