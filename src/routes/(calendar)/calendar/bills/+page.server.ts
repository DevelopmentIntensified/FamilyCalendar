import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBillsForUser } from '$lib/server/db/actions/bills';
import { getFamilyMemberRole, getUserFamilyId } from '$lib/server/db/actions/families';
import { guard } from '$lib/server/utils/guard';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	const loadWarnings: string[] = [];

	const familyG = await guard('family', null, () => getUserFamilyId(userId));
	if (familyG.error) loadWarnings.push(familyG.error);
	const familyId = familyG.data;

	const billsG = await guard('bills', [], () => getBillsForUser(userId, familyId));
	if (billsG.error) loadWarnings.push(billsG.error);

	const roleG = await guard('role', null, () =>
		familyId ? getFamilyMemberRole(userId, familyId) : Promise.resolve(null)
	);
	if (roleG.error) loadWarnings.push(roleG.error);
	// No family yet: personal bills, editable. In a family: creator/admin
	// write; members — and any case where the role is unknown (failed fetch,
	// non-member) — read. The server's canMutateBill stays the real gate.
	const canEdit = familyId ? roleG.data === 'creator' || roleG.data === 'admin' : true;

	// Cloud scan capability (issue 010): env PRESENCE only — no key or
	// endpoint values ever reach the client.
	const cloudScanAvailable = Boolean(
		process.env.AZURE_DOC_INTELLIGENCE_KEY && process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT
	);

	return {
		bills: billsG.data,
		familyId: familyId ?? null,
		canEdit,
		cloudScanAvailable,
		loadWarnings
	};
};
