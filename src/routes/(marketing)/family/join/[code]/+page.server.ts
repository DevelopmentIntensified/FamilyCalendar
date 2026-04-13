import type { PageServerLoad } from './$types';
import { verifyInviteCode } from '$lib/server/db/actions/families';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { code } = params;

	const result = await verifyInviteCode(code);

	if (!result) {
		throw redirect(302, '/family?error=invalid_invite');
	}

	return {
		family: {
			id: result.family.id,
			name: result.family.name,
			color: result.family.color
		},
		code,
		isLoggedIn: !!locals.user
	};
};
