import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBillsForUser } from '$lib/server/db/actions/bills';
import { buildReceiptsByBillId, getAttachmentsByIds } from '$lib/server/db/actions/attachments';
import { getFamilyMemberRole, getUserFamilyId } from '$lib/server/db/actions/families';
import { guard } from '$lib/server/utils/guard';
import type { ReceiptsByBillId } from '$lib/server/db/actions/attachments';

/** Guard fallback so the load return type stays ReceiptsByBillId. */
const EMPTY_RECEIPTS: ReceiptsByBillId = {};

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

	const receiptsG = await guard('receipts', EMPTY_RECEIPTS, () =>
		getAttachmentsByIds(
			billsG.data.map((bill) => bill.attachmentId).filter((id): id is string => id !== null)
		).then((attachments) => buildReceiptsByBillId(billsG.data, attachments))
	);
	if (receiptsG.error) loadWarnings.push(receiptsG.error);

	const roleG = await guard('role', null, () =>
		familyId ? getFamilyMemberRole(userId, familyId) : Promise.resolve(null)
	);
	if (roleG.error) loadWarnings.push(roleG.error);
	// No family yet: personal bills, editable. In a family: creator/admin
	// write; members — and any case where the role is unknown (failed fetch,
	// non-member) — read. The server's canMutateBill stays the real gate.
	const canEdit = familyId ? roleG.data === 'creator' || roleG.data === 'admin' : true;

	return {
		bills: billsG.data,
		receiptsByBillId: receiptsG.data,
		familyId: familyId ?? null,
		canEdit,
		loadWarnings
	};
};
