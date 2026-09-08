import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBillsForUser, getItemsForBills } from '$lib/server/db/actions/bills';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { guard } from '$lib/server/utils/guard';
import {
	billsInMonthRange,
	monthKeysBetween,
	presetMonthRange,
	spendByCategory,
	spendByMonth,
	topItems,
	type MonthRange,
	type SpendRangePreset
} from '$lib/server/services/spendDetail';
import type { ReceiptItem } from '$lib/server/db/schema';

const PRESETS: string[] = ['this-month', 'last-month', 'last-3', 'last-6', 'this-year', 'all'];

/** 'YYYY-MM-DD' from a date input value, or null when blank/malformed. */
function dateParam(value: string | null): string | null {
	return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	const loadWarnings: string[] = [];

	// SAME visibility rules as the bills page: family bills via the user's
	// family + personal bills. Unconfirmed email-ingest drafts (#033) never
	// count as spent — the same source filter as the bills page load.
	const familyG = await guard('family', null, () => getUserFamilyId(userId));
	if (familyG.error) loadWarnings.push(familyG.error);
	const familyId = familyG.data;

	const billsG = await guard('bills', [], () => getBillsForUser(userId, familyId));
	if (billsG.error) loadWarnings.push(billsG.error);
	const bills = billsG.data;

	// Two queries total: bills above + their line items below; everything
	// else folds in memory.
	const itemsG = await guard('line items', new Map<string, ReceiptItem[]>(), () =>
		getItemsForBills(bills.map((bill) => bill.id))
	);
	if (itemsG.error) loadWarnings.push(itemsG.error);

	// Range: a preset (default last-6 months) or custom from/to dates.
	const rangeParam = event.url.searchParams.get('range') ?? 'last-6';
	// SAFETY: the membership check above rules out anything but the
	// SpendRangePreset literals; the assertion narrows the query-string
	// string back to that union.
	const range: SpendRangePreset =
		rangeParam === 'custom' || PRESETS.includes(rangeParam)
			? (rangeParam as SpendRangePreset)
			: 'last-6';
	const customFrom = dateParam(event.url.searchParams.get('from'));
	const customTo = dateParam(event.url.searchParams.get('to'));

	const settled = bills.filter((bill) => (bill.source ?? 'manual') === 'manual');
	const undated = settled.filter((bill) => !bill.dueDate);

	// Month buckets: 'all' shows every month that has bills (plus the
	// Undated row); presets/custom get a continuous month list so gaps show.
	let months: string[] = [];
	let inRange = settled;
	let showUndatedRow = false;
	if (range === 'all') {
		months = [
			...new Set(
				settled.filter((bill) => bill.dueDate).map((bill) => (bill.dueDate ?? '').slice(0, 7))
			)
		].sort();
		inRange = settled.filter((bill) => bill.dueDate);
		showUndatedRow = undated.length > 0;
	} else {
		let bounds: MonthRange | null = presetMonthRange(range);
		if (range === 'custom' && (customFrom || customTo)) {
			// One-sided custom ranges clamp to that single month.
			bounds = {
				from: (customFrom ?? customTo ?? '').slice(0, 7),
				to: (customTo ?? customFrom ?? '').slice(0, 7)
			};
		}
		if (range === 'custom' && !customFrom && !customTo) {
			// Custom picked with no dates yet: show the default range.
			bounds = presetMonthRange('last-6');
		}
		if (bounds) {
			months = monthKeysBetween(bounds.from, bounds.to);
			inRange = billsInMonthRange(settled, bounds.from, bounds.to);
		}
	}

	const buckets = spendByMonth(inRange, itemsG.data, months);
	const rangeSpend = spendByCategory(inRange, itemsG.data);
	const undatedSpend = showUndatedRow ? spendByCategory(undated, itemsG.data) : [];
	const items = topItems(inRange, itemsG.data);

	return {
		range,
		customFrom,
		customTo,
		months,
		buckets,
		rangeSpend,
		undatedSpend,
		topItems: items,
		// Drill-down list: only the bills that can appear in the report.
		bills: showUndatedRow ? [...inRange, ...undated] : inRange,
		totalBills: settled.length,
		loadWarnings
	};
};
