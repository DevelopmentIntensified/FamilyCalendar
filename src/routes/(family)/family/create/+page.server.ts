import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { families, familyMembers, calendars, users } from '$lib/server/db/schema';
import { generateId } from 'lucia';
import {
	canCreateFamily,
	getUserSubscriptionLimits
} from '$lib/server/services/subscriptionService';
import { DEFAULT_FAMILY_COLOR, isFamilyColor } from '$lib/utils/familyPalette';
import { inArray } from 'drizzle-orm';

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

function isString(value: FormDataEntryValue | null): value is string {
	return typeof value === 'string';
}

function formString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return isString(value) ? value : '';
}

/** The picked member ids, cleaned: no blanks, no repeats, and never the creator. */
function pickedMemberIds(formData: FormData, creatorId: string): string[] {
	const seen = new Set<string>();
	for (const value of formData.getAll('memberIds')) {
		if (!isString(value)) continue;
		const id = value.trim();
		if (!id || id === creatorId) continue;
		seen.add(id);
	}
	return [...seen];
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

		// "Who is in it" (issue 076). The picker posts one `memberIds` field per
		// person; the family does not exist yet, so this is the only place their
		// membership can be written — and it has to be written here rather than
		// left to a second trip through the members page.
		const picked = pickedMemberIds(formData, userId);

		if (picked.length > 0) {
			// A crafted form post can name any id, so every pick is checked
			// against a real, verified account. A picker never offers anything
			// else, and an address nobody has verified is not somebody to add.
			const found = await db
				.select({ id: users.id, emailVerified: users.emailVerified })
				.from(users)
				.where(inArray(users.id, picked));
			const addable = new Set(found.filter((u) => u.emailVerified).map((u) => u.id));
			if (picked.some((id) => !addable.has(id))) {
				return fail(400, {
					error:
						'One of the people you picked cannot be added yet — send them an email invite instead.',
					name,
					color
				});
			}

			// The member limit is enforced here, not only in the picker. The
			// family has no id to ask about yet, so the creator's own plan limit
			// is the number — the same one `canAddFamilyMember` would resolve for
			// this family once it exists. The creator counts as one member.
			const { memberLimit } = await getUserSubscriptionLimits(userId);
			if (1 + picked.length > memberLimit) {
				return fail(403, {
					error: `Your plan allows ${memberLimit} member${memberLimit === 1 ? '' : 's'} in a family. Create the family first, then add the rest from the family page.`,
					name,
					color
				});
			}
		}

		try {
			// One transaction: the three inserts were never atomic, so a failure
			// half-way left a family with no calendar and no members (issue 076).
			await db.transaction(async (tx) => {
				await tx.insert(families).values({
					id: familyId,
					name: name.trim(),
					color: familyColor
				});

				await tx.insert(familyMembers).values([
					{ userId, familyId, role: 'creator', memberType: 'member' },
					// role is the permission, memberType is the personal profile —
					// two different things, so both are written down here rather
					// than inherited from a column default (ADR-0001).
					...picked.map((id) => ({ userId: id, familyId, role: 'member', memberType: 'member' }))
				]);

				await tx.insert(calendars).values({ familyId });
			});
		} catch (error) {
			console.error('Error creating family:', error);
			return fail(500, { error: 'Failed to create family', name, color });
		}

		throw redirect(302, `/family/${familyId}`);
	}
};
