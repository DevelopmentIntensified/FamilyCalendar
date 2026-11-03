import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import {
	canCreateFamily,
	getUserSubscriptionLimits
} from '$lib/server/services/subscriptionService';
import { createFamilyWithMembers } from '$lib/server/services/familyData';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const familyCheck = await canCreateFamily(locals.user.id);
	// The member limit too, so "Who is in it" can say how many people the plan
	// allows before anybody is picked (issue 076).
	const { memberLimit } = await getUserSubscriptionLimits(locals.user.id);

	return {
		user: locals.user,
		familyLimit: familyCheck.limit,
		familyLimitReached: !familyCheck.allowed,
		// The usage line (#075): how many are used against the plan limit, so the
		// upgrade banner is not the only signal. Counted by canCreateFamily itself.
		familyUsed: familyCheck.used,
		memberLimit
	};
};

function formString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === 'string' ? value : '';
}

export const actions: Actions = {
	// The body is shared with POST /api/families (#292 G10d).
	default: async ({ request, locals }) => {
		if (!locals.user) {
			throw redirect(302, '/login');
		}
		let name = '';
		let color = '';
		const result = await createFamilyWithMembers(locals.user.id, async () => {
			const formData = await request.formData();
			name = formString(formData, 'name');
			color = formString(formData, 'color');
			// "Who is in it" (issue 076): one `memberIds` field per person picked.
			return { name, color, memberIds: formData.getAll('memberIds') };
		});
		if (!result.ok) {
			if (result.upgradeRequired) {
				return fail(result.status, { error: result.error, upgradeRequired: true });
			}
			return fail(result.status, { error: result.error, name, color });
		}
		throw redirect(302, `/family/${result.familyId}`);
	}
};
