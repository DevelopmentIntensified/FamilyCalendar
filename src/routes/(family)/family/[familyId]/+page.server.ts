import type { PageServerLoad, Actions } from './$types';
import { error, fail, isHttpError, isRedirect } from '@sveltejs/kit';
import { requireUser, requireUserAction } from '$lib/server/utils/requireUser';
import {
	loadFamilyDetail,
	removeMember,
	setMemberType,
	toggleDashboardModule,
	updateFamilyDetails,
	updateMemberRole,
	type FamilyResult
} from '$lib/server/services/familyData';

// Load + action bodies live in familyData (#292 L0 G10b) so the
// /api/families/{id}/** JSON endpoints run the same checks; this file parses
// forms and maps results onto the page's form-action contract.

/**
 * Unreachable-by-id: wrong family, or a viewer who is not a member of it.
 * Declared as a function so the throw site reads as a statement.
 */
function notFound(): never {
	throw error(404, 'Family not found');
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = requireUser(locals);
	try {
		const detail = await loadFamilyDetail(user.id, params.familyId);
		// A non-member gets a 404, not a rendered page whose five family links
		// point at /family/undefined/... (issue 064).
		if (!detail) notFound();
		return detail;
	} catch (err) {
		// SvelteKit redirects/404s thrown above land here; re-throw them
		// rather than turning a 404 into a page that renders broken links.
		if (isRedirect(err) || isHttpError(err)) throw err;
		console.error('[load] Error:', err);
		throw error(500, 'Could not load this family');
	}
};

function isString(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string';
}

function formString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return isString(value) ? value : '';
}

function toActionResult(result: FamilyResult) {
	return result.ok ? { success: true } : fail(result.status, { error: result.error });
}

export const actions: Actions = {
	removeMember: async ({ request, params, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		return toActionResult(
			await removeMember(auth.user.id, params.familyId, formString(formData, 'userId'))
		);
	},
	updateRole: async ({ request, params, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		return toActionResult(
			await updateMemberRole(
				auth.user.id,
				params.familyId,
				formString(formData, 'userId'),
				formString(formData, 'role')
			)
		);
	},
	// Member Type is a profile label ('parent'|'child'|'member'), not a
	// permission — and this action is admin-only (decision 7).
	setMemberType: async ({ request, params, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		return toActionResult(
			await setMemberType(
				auth.user.id,
				params.familyId,
				formString(formData, 'userId'),
				formString(formData, 'memberType')
			)
		);
	},
	updateFamily: async ({ request, params, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		return toActionResult(
			await updateFamilyDetails(
				auth.user.id,
				params.familyId,
				formString(formData, 'name'),
				formString(formData, 'color')
			)
		);
	},
	toggleDashboardModule: async ({ request, params, locals }) => {
		const auth = requireUserAction(locals);
		if (auth.response) return auth.response;
		const formData = await request.formData();
		return toActionResult(
			await toggleDashboardModule(
				auth.user.id,
				params.familyId,
				formString(formData, 'module'),
				formData.get('enabled') === 'true'
			)
		);
	}
};
