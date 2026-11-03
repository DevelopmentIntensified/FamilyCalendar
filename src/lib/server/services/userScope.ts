/**
 * The viewer's shared scope (#041): settings row + family id + roster, as
 * the calendar group layout loads it ONCE per group entry. Extracted (#292
 * L0) so the JSON twins of the calendar pages (`/api/dashboard`, …) read the
 * same scope the layout hands its pages via parent().
 * Family reads degrade to null/[] — never a 500.
 */
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { getFamilyRoster, getUserFamilyId } from '$lib/server/db/actions/families';

export async function loadUserScope(userId: string) {
	const userSettings = await getUserSettings(userId);
	let familyId: string | null = null;
	let familyMembers: Awaited<ReturnType<typeof getFamilyRoster>> = [];
	try {
		familyId = await getUserFamilyId(userId);
		if (familyId) familyMembers = await getFamilyRoster(familyId);
	} catch {
		familyId = null;
		familyMembers = [];
	}
	return { userSettings, familyId, familyMembers };
}
