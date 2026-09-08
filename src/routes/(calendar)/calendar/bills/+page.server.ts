import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBillsForUser, getItemsForBills } from '$lib/server/db/actions/bills';
import { getFamilyMemberRole, getUserFamilyId } from '$lib/server/db/actions/families';
import { guard } from '$lib/server/utils/guard';
import { billsInMonth, currentMonthKey, spendByCategory } from '$lib/server/services/spendDetail';
import { topTags } from '$lib/server/services/tagTable';
import type { ReceiptItem } from '$lib/server/db/schema';

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
	const bills = billsG.data;

	const roleG = await guard('role', null, () =>
		familyId ? getFamilyMemberRole(userId, familyId) : Promise.resolve(null)
	);
	if (roleG.error) loadWarnings.push(roleG.error);
	// No family yet: personal bills, editable. In a family: creator/admin
	// write; members — and any case where the role is unknown (failed fetch,
	// non-member) — read. The server's canMutateBill stays the real gate.
	const canEdit = familyId ? roleG.data === 'creator' || roleG.data === 'admin' : true;

	// Line Items (#031) — grouped per bill for the editor and Spend Detail.
	const itemsG = await guard('line items', new Map<string, ReceiptItem[]>(), () =>
		getItemsForBills(bills.map((bill) => bill.id))
	);
	if (itemsG.error) loadWarnings.push(itemsG.error);

	// Spend Detail (surface a): month/range aggregation. Default = this
	// month (UTC on the stored dueDate); 'all' skips the month filter.
	const monthParam = event.url.searchParams.get('month');
	const spendMonth = monthParam === 'all' ? 'all' : (monthParam ?? currentMonthKey());
	const inRange = spendMonth === 'all' ? bills : billsInMonth(bills, spendMonth);
	const spend = spendByCategory(inRange, itemsG.data);

	// Preloaded Tag Table suggestions (user top + global top): rendered into
	// a native <datalist>, never per-keystroke server calls.
	const tagsG = await guard('tag suggestions', { user: [], global: [] }, () => topTags(userId));
	if (tagsG.error) loadWarnings.push(tagsG.error);

	// Cloud scan capability (issue 010): env PRESENCE only — no key or
	// endpoint values ever reach the client.
	const cloudScanAvailable = Boolean(
		process.env.AZURE_DOC_INTELLIGENCE_KEY && process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT
	);

	return {
		bills,
		itemsByBill: itemsG.data,
		spend,
		spendMonth,
		tagSuggestions: tagsG.data,
		familyId: familyId ?? null,
		canEdit,
		cloudScanAvailable,
		loadWarnings
	};
};
