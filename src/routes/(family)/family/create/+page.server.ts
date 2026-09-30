import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { families, familyMembers, calendars } from '$lib/server/db/schema';
import { generateId } from 'lucia';
import { canCreateFamily } from '$lib/server/services/subscriptionService';
import { DEFAULT_FAMILY_COLOR, isFamilyColor } from '$lib/utils/familyPalette';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const familyCheck = await canCreateFamily(locals.user.id);

	return {
		user: locals.user,
		familyLimit: familyCheck.limit,
		familyLimitReached: !familyCheck.allowed,
		// The usage line (#075): how many are used against the plan limit, so the
		// upgrade banner is not the only signal. Counted by canCreateFamily itself.
		familyUsed: familyCheck.used
	};
};

function isString(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string';
}

function formString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return isString(value) ? value : '';
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			throw redirect(302, '/login');
		}

		const familyCheck = await canCreateFamily(locals.user.id);
		if (!familyCheck.allowed) {
			return fail(403, {
				error: familyCheck.reason,
				upgradeRequired: true
			});
		}

		const formData = await request.formData();
		const name = formString(formData, 'name');
		const color = formString(formData, 'color');

		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Family name is required', name, color });
		}

		if (name.trim().length > 50) {
			return fail(400, { error: 'Family name must be 50 characters or less', name, color });
		}

		// The colour is free text in the column, so the guard is here (#099): a
		// request carrying no colour gets the declared default, and a request
		// carrying a colour we do not offer is refused rather than stored.
		if (color && !isFamilyColor(color)) {
			return fail(400, { error: 'Pick one of the offered family colours', name, color });
		}
		const familyColor = color || DEFAULT_FAMILY_COLOR;

		const userId = locals.user.id;
		const familyId = generateId(15);

		try {
			await db.insert(families).values({
				id: familyId,
				name: name.trim(),
				color: familyColor
			});

			await db.insert(familyMembers).values({
				userId,
				familyId,
				role: 'creator'
			});

			await db.insert(calendars).values({
				familyId
			});
		} catch (error) {
			console.error('Error creating family:', error);
			return fail(500, { error: 'Failed to create family', name, color });
		}

		throw redirect(302, `/family/${familyId}`);
	}
};
