import { describe, it, expect } from 'vitest';
import { detectMerchant, extractMerchantDraft } from './merchantProfiles';
import { extractReceiptRegex } from './receiptText';

describe('detectMerchant (034 big-box header/footer patterns)', () => {
	const cases: Array<[string, 'home-depot' | 'lowes' | 'walmart' | 'amazon' | null]> = [
		['THE HOME DEPOT\nStore 1234', 'home-depot'],
		['home depot #567', 'home-depot'],
		["LOWE'S HOME IMPROVEMENT\nSALE", 'lowes'],
		['lowes store #456', 'lowes'],
		['Walmart\nWM Supercenter #1234', 'walmart'],
		['wm supercenter savings', 'walmart'],
		['Amazon.com\nOrder Details - Order # 123-456', 'amazon'],
		['AMAZON.COM - Order Details', 'amazon'],
		['amazon\nItems Ordered\nGrand Total: $10.00\nASIN: B01', 'amazon'],
		['Grand Total: $5.00\nASIN B07XYZ', 'amazon'],
		// Negatives: generic receipts never match.
		['KROGER #4412\nWHOLE MILK 3.49', null],
		['Acme Plumbing Co.\nDrain cleaning 120.00', null],
		// 'amazon' the word without invoice markers must not match.
		['kayaking the amazon river was grand', null],
		['grand total of fun today', null],
		['asinine remarks at dinner', null],
		['', null]
	];
	for (const [text, expected] of cases) {
		it(`"${text.slice(0, 32)}" → ${expected ?? 'null'}`, () => {
			expect(detectMerchant(text)).toBe(expected);
		});
	}
});

describe('extractMerchantDraft: Amazon (email invoice + Qty shapes)', () => {
	it('parses the email-invoice shape: Items Ordered, tax, Grand Total, ASIN ignored', () => {
		const text = [
			'Amazon.com',
			'Order Details - Order # 123-4567890-1234567',
			'Ordered on September 6, 2026',
			'Items Ordered                          Price',
			'1 of: Echo Dot (5th Gen) Smart Speaker  $49.99',
			'1 of: AA Batteries 48-Pack               $12.99',
			'Item Subtotal: $62.98',
			'Shipping & Handling: $0.00',
			'Estimated tax to be collected: $5.04',
			'Grand Total: $68.02',
			'ASIN: B09XYZ1234'
		].join('\n');

		const draft = extractMerchantDraft(text, 'amazon');
		expect(draft.merchant).toBe('Amazon');
		expect(draft.items).toEqual([
			{ label: 'Echo Dot (5th Gen) Smart Speaker', priceCents: 4999 },
			{ label: 'AA Batteries 48-Pack', priceCents: 1299 }
		]);
		expect(draft.subtotalCents).toBe(6298);
		expect(draft.taxCents).toBe(504);
		expect(draft.totalCents).toBe(6802);
		expect(draft.dateIso).toBe('2026-09-06');
	});

	it('multiplies the N-of count into the unit price', () => {
		const text = [
			'amazon.com',
			'Order # 987-6543210-0000000',
			'Items Ordered',
			'2 of: Kitchen Towels 4-Pack $8.50',
			'Item Subtotal: $17.00',
			'Grand Total: $18.36',
			'ASIN B07ABCDEF'
		].join('\n');

		const draft = extractMerchantDraft(text, 'amazon');
		expect(draft.items).toEqual([{ label: 'Kitchen Towels 4-Pack', priceCents: 1700 }]);
		expect(draft.totalCents).toBe(1836);
	});

	it('applies a trailing Qty line to the last item once', () => {
		const text = [
			'Amazon.com Order Details',
			'1 of: HDMI Cable 6FT $11.99',
			'Qty: 2',
			'Item Subtotal: $23.98',
			'Estimated tax: $1.92',
			'Grand Total: $25.90'
		].join('\n');

		const draft = extractMerchantDraft(text, 'amazon');
		expect(draft.items).toEqual([{ label: 'HDMI Cable 6FT', priceCents: 2398 }]);
		expect(draft.subtotalCents).toBe(2398);
		expect(draft.taxCents).toBe(192);
		expect(draft.totalCents).toBe(2590);
	});
});
describe('receiptText wire-in: merchant-first deterministic pipeline', () => {
	const HD_PAPER = [
		'THE HOME DEPOT',
		'Store 1234  Anytown USA',
		'Cashier: JANE  09/06/2026  10:15 AM',
		'0435932 QUIKRETE CONCRETE MIX 60LB      5.47',
		'0023451 2X4-8FT #2 SPRUCE LUMBER       4.28',
		'SUBTOTAL                                   9.75',
		'SALES TAX                                  0.78',
		'TOTAL                                    $10.53'
	].join('\n');

	const AMAZON_EMAIL = [
		'Amazon.com',
		'Order Details - Order # 123-4567890-1234567',
		'Ordered on September 6, 2026',
		'1 of: Echo Dot (5th Gen) Smart Speaker  $49.99',
		'Item Subtotal: $49.99',
		'Estimated tax to be collected: $4.00',
		'Grand Total: $53.99',
		'ASIN: B09XYZ1234'
	].join('\n');

	it('routes Home Depot text through the merchant extractor', () => {
		const draft = extractReceiptRegex(HD_PAPER);
		expect(draft.source).toBe('regex');
		expect(draft.merchant).toBe('Home Depot');
		expect(draft.items).toEqual([
			{ label: 'QUIKRETE CONCRETE MIX 60LB', priceCents: 547, category: null, name: null },
			{ label: '2X4-8FT #2 SPRUCE LUMBER', priceCents: 428, category: null, name: null },
			{ label: 'Sales tax', priceCents: 78, category: 'tax', name: null }
		]);
		expect(draft.totalCents).toBe(1053);
		expect(draft.date).toBe('2026-09-06');
	});

	it('routes Amazon text through the merchant extractor', () => {
		const draft = extractReceiptRegex(AMAZON_EMAIL);
		expect(draft.merchant).toBe('Amazon');
		expect(draft.items).toEqual([
			{
				label: 'Echo Dot (5th Gen) Smart Speaker',
				priceCents: 4999,
				category: null,
				name: null
			},
			{ label: 'Sales tax', priceCents: 400, category: 'tax', name: null }
		]);
		expect(draft.totalCents).toBe(5399);
	});

	it('leaves non-matching text on the generic path', () => {
		const draft = extractReceiptRegex(
			['KROGER #4412', 'WHOLE MILK        3.49', 'TOTAL            15.12'].join('\n')
		);
		expect(draft.merchant).toBe('KROGER #4412');
		expect(draft.items).toEqual([
			{ label: 'WHOLE MILK', priceCents: 349, category: null, name: null }
		]);
		expect(draft.totalCents).toBe(1512);
	});
});
describe("extractMerchantDraft: Lowe's (paper + condensed)", () => {
	it('parses the SALE paper shape: item numbers stripped, totals, date', () => {
		const text = [
			"LOWE'S HOME IMPROVEMENT",
			'Store #0456',
			'SALE',
			'00443 2X4-8FT STUD PRIME              4.18',
			'12390 5/8 DRYWALL SHEET 4X8           12.97',
			'SUBTOTAL                                17.15',
			'TAX                                      1.37',
			'TOTAL                                   18.52',
			'09/06/2026'
		].join('\n');

		const draft = extractMerchantDraft(text, 'lowes');
		expect(draft.merchant).toBe("Lowe's");
		expect(draft.items).toEqual([
			{ label: '2X4-8FT STUD PRIME', priceCents: 418 },
			{ label: '5/8 DRYWALL SHEET 4X8', priceCents: 1297 }
		]);
		expect(draft.subtotalCents).toBe(1715);
		expect(draft.taxCents).toBe(137);
		expect(draft.totalCents).toBe(1852);
		expect(draft.dateIso).toBe('2026-09-06');
	});

	it('parses the condensed lowercase shape', () => {
		const text = ['lowes #45', 'sale', 'drywall sheet 12.97', 'stud 4.18', 'total 18.52'].join(
			'\n'
		);

		const draft = extractMerchantDraft(text, 'lowes');
		expect(draft.items).toEqual([
			{ label: 'drywall sheet', priceCents: 1297 },
			{ label: 'stud', priceCents: 418 }
		]);
		expect(draft.totalCents).toBe(1852);
	});
});

describe('extractMerchantDraft: Walmart (paper + condensed)', () => {
	it('parses taxable `*` rows, TAX n, TC# footer, slash date', () => {
		const text = [
			'Walmart',
			'WM Supercenter #1234',
			'GREAT VALUE MILK 1GAL              3.48 *',
			'EGGS LARGE 12CT                    2.94',
			'BREAD WHITE 20OZ                   1.47 *',
			'SUBTOTAL                           7.89',
			'TAX 1                              0.24',
			'TOTAL                              8.13',
			'TC# 1234 5678 9012',
			'09/06/26'
		].join('\n');

		const draft = extractMerchantDraft(text, 'walmart');
		expect(draft.merchant).toBe('Walmart');
		expect(draft.items).toEqual([
			{ label: 'GREAT VALUE MILK 1GAL', priceCents: 348 },
			{ label: 'EGGS LARGE 12CT', priceCents: 294 },
			{ label: 'BREAD WHITE 20OZ', priceCents: 147 }
		]);
		expect(draft.subtotalCents).toBe(789);
		expect(draft.taxCents).toBe(24);
		expect(draft.totalCents).toBe(813);
		expect(draft.dateIso).toBe('2026-09-06');
	});

	it('parses the condensed lowercase shape', () => {
		const text = ['walmart', 'milk 3.48 *', 'eggs 2.94', 'tax 0.24', 'total 6.66'].join('\n');

		const draft = extractMerchantDraft(text, 'walmart');
		expect(draft.items).toEqual([
			{ label: 'milk', priceCents: 348 },
			{ label: 'eggs', priceCents: 294 }
		]);
		expect(draft.totalCents).toBe(666);
	});
});
describe('extractMerchantDraft: Home Depot (paper + condensed)', () => {
	it('parses the in-store paper shape: SKUs stripped, totals, tax, date', () => {
		const text = [
			'THE HOME DEPOT',
			'Store 1234  Anytown USA',
			'Cashier: JANE  09/06/2026  10:15 AM',
			'0435932 QUIKRETE CONCRETE MIX 60LB      5.47',
			'0023451 2X4-8FT #2 SPRUCE LUMBER       4.28',
			'1234567 BEHR PREMIUM PAINT 1GAL       34.98',
			'SUBTOTAL                                  44.73',
			'SALES TAX                                  3.58',
			'TOTAL                                    $48.31',
			'VISA ****1234',
			'THANK YOU FOR SHOPPING'
		].join('\n');

		const draft = extractMerchantDraft(text, 'home-depot');
		expect(draft.merchant).toBe('Home Depot');
		expect(draft.items).toEqual([
			{ label: 'QUIKRETE CONCRETE MIX 60LB', priceCents: 547 },
			{ label: '2X4-8FT #2 SPRUCE LUMBER', priceCents: 428 },
			{ label: 'BEHR PREMIUM PAINT 1GAL', priceCents: 3498 }
		]);
		expect(draft.subtotalCents).toBe(4473);
		expect(draft.taxCents).toBe(358);
		expect(draft.totalCents).toBe(4831);
		expect(draft.dateIso).toBe('2026-09-06');
	});

	it('parses the condensed lowercase shape without SKUs', () => {
		const text = [
			'home depot #567',
			'quikrete concrete mix 5.47',
			'2x4 stud 4.28',
			'subtotal 9.75',
			'tax 0.78',
			'total 10.53'
		].join('\n');

		const draft = extractMerchantDraft(text, 'home-depot');
		expect(draft.merchant).toBe('Home Depot');
		expect(draft.items).toEqual([
			{ label: 'quikrete concrete mix', priceCents: 547 },
			{ label: '2x4 stud', priceCents: 428 }
		]);
		expect(draft.totalCents).toBe(1053);
		expect(draft.taxCents).toBe(78);
	});
});
