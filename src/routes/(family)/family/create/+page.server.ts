import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { families, familyMembers, calendars } from '$lib/server/db/schema';
import { generateId } from 'lucia';
import { canCreateFamily } from '$lib/server/services/subscriptionService';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const familyCheck = await canCreateFamily(locals.user.id);

	return {
		user: locals.user,
		familyLimit: familyCheck.limit,
		familyLimitReached: !familyCheck.allowed
	};
};

const FAMILY_COLORS = [
	{ name: 'Red', value: '#EF4444' },
	{ name: 'Orange', value: '#F97316' },
	{ name: 'Amber', value: '#F59E0B' },
	{ name: 'Yellow', value: '#EAB308' },
	{ name: 'Lime', value: '#84CC16' },
	{ name: 'Green', value: '#22C55E' },
	{ name: 'Emerald', value: '#10B981' },
	{ name: 'Teal', value: '#14B8A6' },
	{ name: 'Cyan', value: '#06B6D4' },
	{ name: 'Sky', value: '#0EA5E9' },
	{ name: 'Blue', value: '#3B82F6' },
	{ name: 'Indigo', value: '#6366F1' },
	{ name: 'Violet', value: '#8B5CF6' },
	{ name: 'Purple', value: '#A855F7' },
	{ name: 'Fuchsia', value: '#D946EF' },
	{ name: 'Pink', value: '#EC4899' },
	{ name: 'Rose', value: '#F43F5E' }
];

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
		const name = formData.get('name') as string;
		const color = formData.get('color') as string;

		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Family name is required', name, color });
		}

		if (name.trim().length > 50) {
			return fail(400, { error: 'Family name must be 50 characters or less', name, color });
		}

		const userId = locals.user.id;
		const familyId = generateId(15);

		try {
			await db.insert(families).values({
				id: familyId,
				name: name.trim(),
				color: color || '#3B82F6'
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


