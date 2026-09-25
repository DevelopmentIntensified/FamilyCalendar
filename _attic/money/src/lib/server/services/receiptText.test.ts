import { describe, it, expect } from 'vitest';
import { extractReceiptRegex, normalizeLlmReceipt, RECEIPT_EXTRACTION_PROMPT } from './receiptText';

describe('extractReceiptRegex (deterministic fallback)', () => {
	it('parses a classic grocery receipt: merchant, items, tax, total', () => {
		const text = [
			'KROGER #4412',
			'1234 Main St',
			'2026-09-06',
			'WHOLE MILK        3.49',
			'BANANAS           1.25',
			'SALES TAX         0.38',
			'TOTAL            15.12',
			'VISA ****1234'
		].join('\n');

		const draft = extractReceiptRegex(text);
		expect(draft.source).toBe('regex');
		expect(draft.merchant).toBe('KROGER #4412');
		expect(draft.date).toBe('2026-09-06');
		expect(draft.items).toEqual([
			{ label: 'WHOLE MILK', priceCents: 349, category: null, name: null },
			{ label: 'BANANAS', priceCents: 125, category: null, name: null },
			{ label: 'SALES TAX', priceCents: 38, category: 'tax', name: null }
		]);
		expect(draft.totalCents).toBe(1512);
	});

	it('tolerates an invoice layout with bill-to block and dotted leaders', () => {
		const text = [
			'INVOICE #2026-0041',
			'Acme Plumbing Co.',
			'Bill To: Jane Doe',
			'Date: Sep 6, 2026',
			'Drain cleaning ............ $120.00',
			'Pipe replacement .......... $340.00',
			'Service call fee .......... $49.00',
			'SUBTOTAL                  509.00',
			'TAX (8%)                    40.72',
			'TOTAL DUE                 549.72'
		].join('\n');

		const draft = extractReceiptRegex(text);
		expect(draft.merchant).toBe('Acme Plumbing Co.');
		expect(draft.date).toBe('2026-09-06');
		expect(draft.items).toEqual([
			{ label: 'Drain cleaning', priceCents: 12000, category: null, name: null },
			{ label: 'Pipe replacement', priceCents: 34000, category: null, name: null },
			{ label: 'Service call fee', priceCents: 4900, category: 'fees', name: null },
			{ label: 'TAX (8%)', priceCents: 4072, category: 'tax', name: null }
		]);
		expect(draft.totalCents).toBe(54972);
	});

	it('parses US slash dates and currency-prefixed prices', () => {
		const text = ['Corner Cafe', '09/06/26', 'Coffee $3.50', 'Muffin $4.00', 'TOTAL $7.50'].join(
			'\n'
		);

		const draft = extractReceiptRegex(text);
		expect(draft.date).toBe('2026-09-06');
		expect(draft.items).toEqual([
			{ label: 'Coffee', priceCents: 350, category: null, name: null },
			{ label: 'Muffin', priceCents: 400, category: null, name: null }
		]);
		expect(draft.totalCents).toBe(750);
	});

	it('falls back to summing items when no total line exists', () => {
		const text = ['Hardware Store', 'Screws $4.00', 'Sandpaper $2.50'].join('\n');

		const draft = extractReceiptRegex(text);
		expect(draft.totalCents).toBe(650);
	});

	it('never treats totals, subtotals, or tenders as line items', () => {
		const text = [
			'Shop',
			'Widget $5.00',
			'SUBTOTAL 5.00',
			'TOTAL 5.36',
			'CASH TENDERED 10.00',
			'CHANGE 4.64'
		].join('\n');

		const draft = extractReceiptRegex(text);
		expect(draft.items).toEqual([{ label: 'Widget', priceCents: 500, category: null, name: null }]);
	});

	it('returns an empty draft for unusable text', () => {
		const draft = extractReceiptRegex('hello world\nno numbers here');
		expect(draft.merchant).toBe('hello world');
		expect(draft.items).toEqual([]);
		expect(draft.totalCents).toBeNull();
		expect(draft.date).toBeNull();
	});

	it('caps line items at 50', () => {
		const lines = ['Store'];
		for (let i = 0; i < 60; i++) lines.push(`Item ${i} $1.00`);
		const draft = extractReceiptRegex(lines.join('\n'));
		expect(draft.items).toHaveLength(50);
	});
});

describe('normalizeLlmReceipt', () => {
	it('normalizes a valid LLM payload with dollar prices', () => {
		const draft = normalizeLlmReceipt({
			merchant: 'Whole Foods',
			total: 23.45,
			date: '2026-09-06',
			currency: 'USD',
			taxAmount: 1.45,
			lineItems: [
				{ label: 'Organic Milk', price: 4.99, category: 'groceries' },
				{ label: 'Sales tax', price: 1.45, category: 'tax' }
			]
		});

		expect(draft).not.toBeNull();
		expect(draft!.source).toBe('llm');
		expect(draft!.merchant).toBe('Whole Foods');
		expect(draft!.date).toBe('2026-09-06');
		// Unknown category → null (inherit the bill's category).
		expect(draft!.items).toEqual([
			{ label: 'Organic Milk', priceCents: 499, category: null, name: null },
			{ label: 'Sales tax', priceCents: 145, category: 'tax', name: null }
		]);
		expect(draft!.totalCents).toBe(2345);
	});

	it('accepts integer priceCents and totalCents forms', () => {
		const draft = normalizeLlmReceipt({
			merchant: 'Shop',
			totalCents: 1000,
			lineItems: [{ label: 'Thing', priceCents: 1000 }]
		});
		expect(draft!.totalCents).toBe(1000);
		expect(draft!.items[0]).toEqual({
			label: 'Thing',
			priceCents: 1000,
			category: null,
			name: null
		});
	});

	it('sums items and tax/fee amounts when the total is missing', () => {
		const draft = normalizeLlmReceipt({
			merchant: 'Shop',
			lineItems: [{ label: 'Thing', price: 5 }],
			taxAmount: 0.4,
			feeAmount: 0.1
		});
		expect(draft!.totalCents).toBe(550);
	});

	it('maps every BILL_CATEGORIES value through', () => {
		const draft = normalizeLlmReceipt({
			lineItems: [
				{ label: 'Rent', price: 1, category: 'housing' },
				{ label: 'Power', price: 1, category: 'utilities' },
				{ label: 'Fees', price: 1, category: 'fees' }
			]
		});
		expect(draft!.items.map((i) => i.category)).toEqual(['housing', 'utilities', 'fees']);
	});

	it('returns null for non-object or unusable payloads', () => {
		expect(normalizeLlmReceipt(null)).toBeNull();
		expect(normalizeLlmReceipt('nope')).toBeNull();
		expect(normalizeLlmReceipt({})).toBeNull();
		expect(normalizeLlmReceipt({ lineItems: 'nope' })).toBeNull();
	});

	it('drops items without a label or a usable price', () => {
		const draft = normalizeLlmReceipt({
			merchant: 'Shop',
			lineItems: [
				{ label: '', price: 5 },
				{ label: 'No price' },
				{ label: 'Bad price', price: 'abc' },
				{ label: 'Good', price: 1.5 }
			]
		});
		expect(draft!.items).toHaveLength(1);
		expect(draft!.items[0].label).toBe('Good');
	});

	it('caps line items at 50 and rejects bad dates', () => {
		const items = Array.from({ length: 60 }, (_, i) => ({ label: `i${i}`, price: 1 }));
		const draft = normalizeLlmReceipt({ merchant: 'Shop', lineItems: items });
		expect(draft!.items).toHaveLength(50);

		const bad = normalizeLlmReceipt({ merchant: 'Shop', date: 'next tuesday' });
		expect(bad!.date).toBeNull();
	});

	it('carries the invoice-tolerant extraction prompt', () => {
		expect(RECEIPT_EXTRACTION_PROMPT).toContain('lineItems');
		expect(RECEIPT_EXTRACTION_PROMPT).toContain('taxAmount');
		expect(RECEIPT_EXTRACTION_PROMPT).toContain('feeAmount');
		expect(RECEIPT_EXTRACTION_PROMPT).toContain('JSON');
	});
});
