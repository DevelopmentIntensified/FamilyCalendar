import { describe, it, expect } from 'vitest';
import {
	BILL_CATEGORIES,
	isBillCategory,
	CATEGORY_KEYWORDS,
	categoryForKeyword,
	type BillCategory
} from './categories';
// Schema re-exports the data module — this import pair IS the drift guard:
// if either copy is edited independently, the equality below fails.
import { BILL_CATEGORIES as SCHEMA_BILL_CATEGORIES } from '$lib/server/db/schema';
import { cloudScanReceipt } from '$lib/client/receiptOcr';

describe('BILL_CATEGORIES (single source of truth, arch audit #4)', () => {
	it('matches the schema re-export exactly', () => {
		expect([...BILL_CATEGORIES]).toEqual([...SCHEMA_BILL_CATEGORIES]);
	});

	it('is the closed #031 vocabulary', () => {
		expect([...BILL_CATEGORIES]).toEqual([
			'housing',
			'utilities',
			'subscriptions',
			'insurance',
			'tax',
			'fees',
			'other'
		]);
	});
});

describe('isBillCategory', () => {
	it('accepts every vocabulary value', () => {
		for (const category of BILL_CATEGORIES) expect(isBillCategory(category)).toBe(true);
	});

	it('rejects non-members', () => {
		for (const value of ['nope', 'TAX', '', null, undefined, 42, {}]) {
			expect(isBillCategory(value)).toBe(false);
		}
	});
});

describe('cloud normalization drift guard (the #4 audit live bug)', () => {
	// receiptOcr's CLOUD_CATEGORIES copy dropped tax/fees: Azure scans with
	// those categories silently downgraded to 'other'. This guard pins the
	// cloud path to the shared vocabulary — every member must round-trip.
	const file = new File([new Uint8Array(4)], 'r.jpg', { type: 'image/jpeg' });
	const strip = async () => new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' });
	const fetchReturning = (category: string) => async () =>
		new Response(
			JSON.stringify({ scan: { merchant: 'M', totalCents: 500, date: null, category } }),
			{ status: 200 }
		);

	for (const category of BILL_CATEGORIES) {
		it(`cloud scan with category "${category}" survives normalization`, async () => {
			const scan = await cloudScanReceipt(file, {
				fetchFn: fetchReturning(category),
				strip
			});
			expect(scan.category, category).toBe(category);
		});
	}
});

describe('CATEGORY_KEYWORDS (shared merchant table)', () => {
	it('gives every category at least one keyword (except "other" — the fallback)', () => {
		const withWords = new Set(
			CATEGORY_KEYWORDS.filter((e) => e.words.length > 0).map((e) => e.category)
		);
		for (const category of BILL_CATEGORIES) {
			if (category === 'other') continue;
			expect(withWords.has(category), category).toBe(true);
		}
		expect(CATEGORY_KEYWORDS.find((e) => e.category === 'other')?.words ?? []).toEqual([]);
	});

	it('is de-duplicated: no word appears twice', () => {
		const words = CATEGORY_KEYWORDS.flatMap((e) => e.words);
		expect(new Set(words).size).toBe(words.length);
	});

	it('words are lowercase (matcher contract)', () => {
		for (const word of CATEGORY_KEYWORDS.flatMap((e) => e.words)) {
			expect(word, word).toBe(word.toLowerCase());
		}
	});

	it('every word resolves to its own entry via categoryForKeyword (no order shadowing)', () => {
		for (const entry of CATEGORY_KEYWORDS) {
			for (const word of entry.words) {
				expect(categoryForKeyword(word), word).toBe(entry.category);
			}
		}
	});
});

describe('categoryForKeyword (word-boundary matcher, union of both old tables)', () => {
	const cases: Array<[string, BillCategory | null]> = [
		// tax first (#031): explicit tax words are their own category.
		['tax', 'tax'],
		['property taxes due', 'tax'],
		['SALES TAX 6.25', 'tax'],
		['VAT 4.50', 'tax'],
		['GST INCLUDED', 'tax'],
		// fees.
		['fee', 'fees'],
		['SERVICE FEE 2.99', 'fees'],
		['delivery fee 5.00', 'fees'],
		['late fee $15', 'fees'],
		['bank surcharge $3', 'fees'],
		// utilities: receiptScan's ISP/carrier words (were missing from NLP).
		['electric', 'utilities'],
		['CITY POWER & LIGHT', 'utilities'],
		['water department', 'utilities'],
		['internet bill', 'utilities'],
		['comcast statement', 'utilities'],
		['xfinity internet', 'utilities'],
		['spectrum cable', 'utilities'],
		['verizon wireless', 'utilities'],
		// utilities: NLP's commodity words (were missing from receiptScan).
		['gas $30 due tomorrow', 'utilities'],
		['trash $18 monthly', 'utilities'],
		['garbage pickup', 'utilities'],
		['broadband 60/month', 'utilities'],
		['phone bill $45', 'utilities'],
		['propane delivery', 'utilities'],
		['heating oil delivery', 'utilities'],
		// subscriptions: NLP's merchants (were missing from receiptScan).
		['netflix', 'subscriptions'],
		['spotify usa', 'subscriptions'],
		['hulu standard', 'subscriptions'],
		['disney plus', 'subscriptions'],
		['hbo max', 'subscriptions'],
		['amazon prime', 'subscriptions'],
		['audible membership', 'subscriptions'],
		['apple one', 'subscriptions'],
		['youtube premium', 'subscriptions'],
		['sirius xm', 'subscriptions'],
		['crunchyroll', 'subscriptions'],
		// insurance.
		['insurance', 'insurance'],
		['geico auto policy', 'insurance'],
		['progressive claim', 'insurance'],
		['allstate agent', 'insurance'],
		['state farm policy', 'insurance'],
		['liberty mutual bill', 'insurance'],
		// housing.
		['rent', 'housing'],
		['mortgage payment', 'housing'],
		['hoa dues', 'housing'],
		['landlord payment', 'housing'],
		['home depot', 'housing'],
		["lowe's receipt", 'housing'],
		['duke energy statement', 'utilities'],
		['national grid', 'utilities'],
		// word boundaries: partial words never match.
		['thunder', null],
		['taxation', null],
		['MAXIMUM flexibility', null],
		['renters rights', null],
		// 'oil' is deliberately NOT a bare keyword (SHELL OIL is a gas
		// station, not a utility — receiptScan's table encoded this); only
		// the "heating oil" phrase matches.
		['SHELL OIL FUEL', null],
		['empty', null],
		['', null]
	];
	for (const [text, expected] of cases) {
		it(`"${text}" → ${expected ?? 'null'}`, () => {
			expect(categoryForKeyword(text)).toBe(expected);
		});
	}

	it('matches are case-insensitive', () => {
		expect(categoryForKeyword('NETFLIX.COM')).toBe('subscriptions');
		expect(categoryForKeyword('GEICO')).toBe('insurance');
	});
});
