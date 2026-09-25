import { describe, it, expect } from 'vitest';
import {
	extractMerchant,
	extractTotalCents,
	extractDateIso,
	suggestCategory,
	scanReceipt
} from './receiptScan';

/**
 * Synthetic OCR text blocks (issue 010): the parser is a pure function over
 * recognized text, so tests feed realistic receipt layouts without any
 * tesseract dependency.
 */
const GROCERY = [
	'KROGER #4412',
	'123 MAIN ST',
	'CINCINNATI OH 45202',
	'09/06/2026  14:32',
	'REG 3  TXNR 88421',
	'BANANAS       1.49',
	'MILK 2%       3.99',
	'BREAD WHEAT   2.79',
	'SUBTOTAL      8.27',
	'TAX           0.00',
	'TOTAL         8.27',
	'CASH TEND    10.00',
	'CHANGE        1.73',
	'THANK YOU FOR SHOPPING KROGER'
].join('\n');

const UTILITY = [
	'CITY POWER & LIGHT',
	'P.O. BOX 9001',
	'BILLING DATE 2026-09-01',
	'ACCOUNT 88-2214',
	'ELECTRIC SERVICE USAGE',
	'AMOUNT DUE      $120.00',
	'DUE BY 09/25/2026',
	'PLEASE DETACH AND RETURN'
].join('\n');

const SUBSCRIPTION = [
	'NETFLIX.COM',
	'866-579-7172',
	'SEP 06, 2026',
	'MEMBERSHIP STANDARD',
	'TOTAL           $15.49',
	'PAID WITH VISA ...1234'
].join('\n');

const GAS_STATION = [
	'SHELL OIL 45209',
	'09/05/2026 08:11',
	'PUMP 5 UNLEADED',
	'11.203 GAL @ 3.459',
	'FUEL TOTAL     38.74',
	'TOTAL          38.74',
	'CREDIT CARD   APPROVED'
].join('\n');

const RESTAURANT = [
	'OUTBACK STEAKHOUSE',
	'GUEST CHECK',
	'09/04/2026 19:05',
	'BLOOMIN ONION  12.99',
	'RIBeye         28.99',
	'SUBTOTAL       41.98',
	'TIP            8.40',
	'TOTAL          50.38'
].join('\n');

const RENT = [
	'ACME PROPERTY MANAGEMENT',
	'RENT RECEIPT',
	'DATE: 09/01/2026',
	'TENANT: JANE SMITH, UNIT 4B',
	'TOTAL DUE    $1,450.00',
	'PAID IN FULL — THANK YOU'
].join('\n');

const INSURANCE = [
	'GEICO AUTO INSURANCE',
	'POLICY 8844-22',
	'09/01/2026',
	'PREMIUM AMOUNT  $148.20',
	'TOTAL          $148.20',
	'THANK YOU FOR CHOOSING GEICO'
].join('\n');

const NO_TOTAL = [
	'HAND WRITTEN HARDWARE',
	'SCREWS BOX     4.50',
	'PAINT BRUSH    7.25',
	'SANDPAPER      3.10',
	'9/2/26'
].join('\n');

const MULTI_TOTALS = [
	'MARKET SQUARE',
	'SUBTOTAL      10.00',
	'TAX            0.80',
	'TOTAL         10.80',
	'*** ORDER TOTAL 10.80 ***',
	'GIFT CARD     -5.00',
	'BALANCE        5.80'
].join('\n');

const JUNK = '\x0c ### 12 8842 0018 %$& @@@ \n (scan failed) 0.00';

describe('extractTotalCents', () => {
	const cases: Array<[string, string, number | null, string]> = [
		['grocery: TOTAL line', GROCERY, 827, '8.27 → 827'],
		['utility: AMOUNT DUE', UTILITY, 12000, '120.00 → 12000'],
		['subscription: TOTAL', SUBSCRIPTION, 1549, '15.49 → 1549'],
		['restaurant: TOTAL over subtotal/tip', RESTAURANT, 5038, '50.38 → 5038'],
		['rent: TOTAL DUE with thousands separator', RENT, 145000, '1,450.00 → 145000'],
		['no TOTAL keyword: falls back to largest amount', NO_TOTAL, 725, '7.25 largest'],
		['multi totals: last total-family amount wins', MULTI_TOTALS, 580, 'BALANCE 5.80 last'],
		['junk: no money at all', JUNK, null, '0.00 is zero → null'],
		['gas: TOTAL line', GAS_STATION, 3874, '38.74 → 3874'],
		['insurance: TOTAL', INSURANCE, 14820, '148.20 → 14820']
	];
	for (const [name, text, expected] of cases) {
		it(`${name} → ${expected}`, () => {
			expect(extractTotalCents(text)).toBe(expected);
		});
	}
});

describe('extractMerchant', () => {
	const cases: Array<[string, string, string | null]> = [
		['grocery', GROCERY, 'KROGER #4412'],
		['utility', UTILITY, 'CITY POWER & LIGHT'],
		['subscription', SUBSCRIPTION, 'NETFLIX.COM'],
		['gas', GAS_STATION, 'SHELL OIL 45209'],
		['restaurant', RESTAURANT, 'OUTBACK STEAKHOUSE'],
		['rent', RENT, 'ACME PROPERTY MANAGEMENT'],
		['insurance', INSURANCE, 'GEICO AUTO INSURANCE'],
		['junk yields nothing', JUNK, null]
	];
	for (const [name, text, expected] of cases) {
		it(`${name} → ${expected ?? 'null'}`, () => {
			expect(extractMerchant(text)).toBe(expected);
		});
	}
});

describe('extractDateIso', () => {
	const cases: Array<[string, string, string | null]> = [
		['MM/DD/YYYY', GROCERY, '2026-09-06'],
		['YYYY-MM-DD', UTILITY, '2026-09-01'],
		['Mon DD, YYYY', SUBSCRIPTION, '2026-09-06'],
		['MM/DD/YYYY later line', GAS_STATION, '2026-09-05'],
		['MM/DD/YYYY', RESTAURANT, '2026-09-04'],
		['DATE: MM/DD/YYYY', RENT, '2026-09-01'],
		['M/D/YY', 'WALMART\n9/2/26\nTOTAL 4.00', '2026-09-02'],
		['Month DD, YYYY', 'ACME\nSeptember 6, 2026\nTOTAL 4.00', '2026-09-06'],
		['slash date on hand-written receipt', NO_TOTAL, '2026-09-02'],
		['junk', JUNK, null]
	];
	for (const [name, text, expected] of cases) {
		it(`${name} → ${expected ?? 'null'}`, () => {
			expect(extractDateIso(text)).toBe(expected);
		});
	}
});

describe('suggestCategory', () => {
	const cases: Array<[string, string, string]> = [
		['electric company', 'CITY POWER & LIGHT ELECTRIC BILL', 'utilities'],
		['water utility', 'COUNTY WATER DEPARTMENT', 'utilities'],
		['internet provider', 'XFINITY INTERNET SERVICES', 'utilities'],
		['gas service', 'PEOPLES GAS SERVICE CO', 'utilities'],
		['streaming', 'NETFLIX.COM MEMBERSHIP', 'subscriptions'],
		['music', 'SPOTIFY USA', 'subscriptions'],
		['software', 'ADOBE SUBSCRIPTION INVOICE', 'subscriptions'],
		['rent receipt', 'ACME PROPERTY MANAGEMENT RENT', 'housing'],
		['mortgage', 'FIRST NATIONAL MORTGAGE PAYMENT', 'housing'],
		['home store', 'HOME DEPOT #4471', 'housing'],
		['auto insurance', 'GEICO AUTO INSURANCE POLICY', 'insurance'],
		['health insurance', 'BLUE CROSS INSURANCE PREMIUM', 'insurance'],
		['sales tax line', 'SALES TAX 6.25', 'tax'],
		['vat line', 'VAT 4.50', 'tax'],
		['gst line', 'GST INCLUDED', 'tax'],
		['service fee line', 'SERVICE FEE 2.99', 'fees'],
		['delivery fee line', 'DELIVERY FEE 5.00', 'fees'],
		['surcharge line', 'PROCESSING SURCHARGE 1.50', 'fees'],
		['grocery store', 'KROGER #4412', 'other'],
		['restaurant', 'OUTBACK STEAKHOUSE', 'other'],
		['gas station fuel', 'SHELL OIL FUEL', 'other'],
		['junk', JUNK, 'other'],
		['empty', '', 'other']
	];
	for (const [name, text, expected] of cases) {
		it(`${name} → ${expected}`, () => {
			expect(suggestCategory(text)).toBe(expected);
		});
	}
});

describe('scanReceipt (aggregator over OCR text)', () => {
	it('fills every field from a clean grocery receipt', () => {
		expect(scanReceipt(GROCERY)).toEqual({
			merchant: 'KROGER #4412',
			totalCents: 827,
			dateIso: '2026-09-06',
			category: 'other'
		});
	});

	it('fills every field from a utility bill', () => {
		expect(scanReceipt(UTILITY)).toEqual({
			merchant: 'CITY POWER & LIGHT',
			totalCents: 12000,
			dateIso: '2026-09-01',
			category: 'utilities'
		});
	});

	it('degrades field-by-field on a noisy receipt', () => {
		const result = scanReceipt(NO_TOTAL);
		expect(result.merchant).toBe('HAND WRITTEN HARDWARE');
		expect(result.totalCents).toBe(725);
		expect(result.dateIso).toBe('2026-09-02');
		expect(result.category).toBe('housing');
	});

	it('returns all-nulls for junk text', () => {
		expect(scanReceipt(JUNK)).toEqual({
			merchant: null,
			totalCents: null,
			dateIso: null,
			category: 'other'
		});
	});

	it('handles empty text', () => {
		expect(scanReceipt('')).toEqual({
			merchant: null,
			totalCents: null,
			dateIso: null,
			category: 'other'
		});
	});
});
