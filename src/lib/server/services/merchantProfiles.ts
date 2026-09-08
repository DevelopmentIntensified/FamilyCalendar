/**
 * Big-box merchant receipt profiles (#034). Pure module: no DB, no network.
 * Pasted/PDF/email receipt text from Home Depot, Lowe's, Walmart, and Amazon
 * follows house layouts (SKU/stock# item runs, `*` taxable flags, TC# footers,
 * digital-invoice Items-Ordered blocks) that the generic regex fallback
 * mangles — so `detectMerchant` spots the house pattern first and
 * `extractMerchantDraft` parses with the matching extractor. Unknown layouts
 * return null and fall through to the generic path unchanged.
 */

import { extractDateIso } from '$lib/utils/receiptScan';

/** The four house layouts this module parses. */
export type MerchantId = 'home-depot' | 'lowes' | 'walmart' | 'amazon';

/** Display name per merchant (the Bill/merchant hint). */
export const MERCHANT_NAMES: Record<MerchantId, string> = {
	'home-depot': 'Home Depot',
	lowes: "Lowe's",
	walmart: 'Walmart',
	amazon: 'Amazon'
};

/** One parsed merchandise row (tax rides separately as `taxCents`). */
export interface MerchantDraftItem {
	label: string;
	priceCents: number;
}

/** The normalized per-merchant draft receiptText converts to its own shape. */
export interface MerchantDraft {
	merchant: string;
	items: MerchantDraftItem[];
	subtotalCents: number | null;
	taxCents: number | null;
	totalCents: number | null;
	dateIso: string | null;
}

/**
 * Spots a house layout from header/footer patterns (case-insensitive).
 * 'amazon' the bare word is NOT enough — it needs an invoice marker
 * (amazon.com, order details, or grand-total + ASIN) so river-trip prose
 * never matches.
 */
export function detectMerchant(text: string): MerchantId | null {
	if (/home\s*depot/i.test(text)) return 'home-depot';
	if (/\blowe'?s\b/i.test(text)) return 'lowes';
	if (/\bwalmart\b|\bwm\s+supercenter\b/i.test(text)) return 'walmart';
	if (isAmazonInvoice(text)) return 'amazon';
	return null;
}

/** Amazon detection: the word plus an invoice marker, or the marker pair. */
function isAmazonInvoice(text: string): boolean {
	const mentionsAmazon = /\bamazon\b/i.test(text) || /amazon\.com/i.test(text);
	const hasOrderDetails = /order details/i.test(text);
	const hasGrandTotal = /grand\s*total/i.test(text);
	const hasAsin = /\basin\b/i.test(text);
	if (/amazon\.com/i.test(text)) return true;
	if (mentionsAmazon && (hasOrderDetails || hasGrandTotal || hasAsin)) return true;
	if (hasGrandTotal && hasAsin) return true;
	return false;
}

/**
 * Parses receipt text with the matching house extractor. Pure dispatch —
 * each extractor below owns one layout.
 */
export function extractMerchantDraft(text: string, merchant: MerchantId): MerchantDraft {
	switch (merchant) {
		case 'home-depot':
			return extractHomeDepot(text);
		case 'lowes':
			return extractLowes(text);
		case 'walmart':
			return extractWalmart(text);
		case 'amazon':
			return extractAmazon(text);
	}
}

/* ── Shared line helpers ─────────────────────────────────────────────── */

const MAX_ITEMS = 50;

/** Integer cents from a trailing dollars string; null when unusable. */
function centsFromDollarsText(raw: string): number | null {
	const value = Number(raw.replace(/,/g, ''));
	if (!Number.isFinite(value) || value < 0) return null;
	const cents = Math.round(value * 100);
	return Number.isSafeInteger(cents) && cents <= 2147483647 ? cents : null;
}

/** Trailing price at end of line, e.g. "QUIKRETE 60LB      5.47". */
const TRAILING_PRICE_RE =
	/^(?<desc>.*?)[\s·•.:—–-]+\$?(?<price>\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*\*?\s*$/;

/** Summary/footer rows that must never become line items. */
const SUMMARY_ROW_RE =
	/(subtotal|total|amount|balance|due|change|tender|tended|cash|card|payment|paid|gift card|tip|previous|visa|mastercard|amex|discover|approval|auth |tc#|items sold|balance)/i;

/** Bounded label; null for numeric-only runs and scan noise. */
function cleanItemLabel(desc: string): string | null {
	const trimmed = desc.replace(/[-\s·•.:—–*]+$/, '').trim();
	if (trimmed.length < 2 || trimmed.length > 60) return null;
	if (!/[a-z]/i.test(trimmed)) return null;
	return trimmed;
}

/** First money amount on a summary line, in cents. */
function summaryLineCents(line: string): number | null {
	const match = line.match(/\$?(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/);
	return match ? centsFromDollarsText(match[1]) : null;
}

/** Strips a leading stock#/SKU numeric run: "0435932 QUIKRETE" → "QUIKRETE". */
function stripSkuRun(desc: string): string {
	return desc.replace(/^[-#*.\d]+\s+(?=[a-z0-9])/i, '').trim();
}

interface StoreReceiptAccumulator {
	items: MerchantDraftItem[];
	subtotalCents: number | null;
	taxCents: number | null;
	totalCents: number | null;
}

/** One pass over `description … price` rows for the paper-store layouts. */
function scanStoreLines(
	lines: string[],
	headerNoise: RegExp,
	taxLine: RegExp
): StoreReceiptAccumulator {
	const acc: StoreReceiptAccumulator = {
		items: [],
		subtotalCents: null,
		taxCents: null,
		totalCents: null
	};
	for (const line of lines) {
		if (headerNoise.test(line)) continue;
		if (/subtotal/i.test(line)) {
			const cents = summaryLineCents(line);
			if (cents !== null) acc.subtotalCents = cents;
			continue;
		}
		if (taxLine.test(line)) {
			const cents = summaryLineCents(line);
			if (cents !== null) acc.taxCents = cents;
			continue;
		}
		if (/\btotal\b/i.test(line)) {
			const cents = summaryLineCents(line);
			if (cents !== null) acc.totalCents = cents;
			continue;
		}
		if (SUMMARY_ROW_RE.test(line)) continue;
		const match = line.match(TRAILING_PRICE_RE);
		if (!match?.groups) continue;
		const priceCents = centsFromDollarsText(match.groups.price);
		if (priceCents === null || priceCents === 0) continue;
		const label = cleanItemLabel(stripSkuRun(match.groups.desc));
		if (!label || acc.items.length >= MAX_ITEMS) continue;
		acc.items.push({ label, priceCents });
	}
	return acc;
}

function splitLines(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function toDraft(merchant: MerchantId, acc: StoreReceiptAccumulator, text: string): MerchantDraft {
	return {
		merchant: MERCHANT_NAMES[merchant],
		items: acc.items,
		subtotalCents: acc.subtotalCents,
		taxCents: acc.taxCents,
		totalCents: acc.totalCents,
		dateIso: extractDateIso(text)
	};
}

/* ── Per-merchant extractors ─────────────────────────────────────────── */

/** Home Depot paper shape: SKU-prefixed rows, store# header, SUBTOTAL/TAX/TOTAL. */
function extractHomeDepot(text: string): MerchantDraft {
	const lines = splitLines(text);
	const headerNoise =
		/home depot|store\s*#|cashier|register|thank you|return policy|survey|www\.|http|how doers/i;
	return toDraft('home-depot', scanStoreLines(lines, headerNoise, /\btax\b/i), text);
}

/** Lowe's paper shape: same family; SALE header; item-number runs. */
function extractLowes(text: string): MerchantDraft {
	const lines = splitLines(text);
	const headerNoise =
		/lowe'?s|store\s*#|cashier|register|^sale$|thank you|return policy|survey|www\.|http/i;
	return toDraft('lowes', scanStoreLines(lines, headerNoise, /\btax\b/i), text);
}

/** Walmart paper shape: `*`-suffixed taxable rows; SUBTOTAL/TAX n/TOTAL/TC# footer. */
function extractWalmart(text: string): MerchantDraft {
	const lines = splitLines(text);
	const headerNoise =
		/^walmart$|wm\s+supercenter|store\s*#|cashier|^st#|^op#|^te#|thank you|www\.|http/i;
	return toDraft('walmart', scanStoreLines(lines, headerNoise, /\btax\b/i), text);
}

/** Amazon digital-invoice shape: Items-Ordered block, quantities, ASIN runs. */
function extractAmazon(text: string): MerchantDraft {
	const items: MerchantDraftItem[] = [];
	let subtotalCents: number | null = null;
	let taxCents: number | null = null;
	let totalCents: number | null = null;
	let qtyOpen = false;

	for (const line of splitLines(text)) {
		if (/^asin\s*:|^\s*asin\s+[a-z0-9]{6,}/i.test(line)) continue;
		const qtyMatch = line.match(/^(?:qty|quantity)\s*:\s*(?<qty>\d{1,3})\s*$/i);
		if (qtyMatch?.groups && items.length > 0 && !qtyOpen) {
			const qty = Number(qtyMatch.groups.qty);
			if (Number.isInteger(qty) && qty >= 2 && qty <= 999) {
				const last = items[items.length - 1];
				const scaled = last.priceCents * qty;
				if (Number.isSafeInteger(scaled) && scaled <= 2147483647) {
					last.priceCents = scaled;
					qtyOpen = true;
				}
			}
			continue;
		}
		const itemMatch = line.match(
			/^(?<count>\d{1,3})\s+of:\s*(?<label>.+?)\s*\$?(?<price>\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*$/
		);
		if (itemMatch?.groups) {
			const count = Number(itemMatch.groups.count);
			const unit = centsFromDollarsText(itemMatch.groups.price);
			const label = cleanItemLabel(itemMatch.groups.label);
			if (!label || unit === null || unit === 0) continue;
			if (!Number.isInteger(count) || count < 1 || count > 999) continue;
			const priceCents = unit * count;
			if (!Number.isSafeInteger(priceCents) || priceCents > 2147483647) continue;
			if (items.length >= MAX_ITEMS) continue;
			items.push({ label, priceCents });
			qtyOpen = false;
			continue;
		}
		if (/item\s*subtotal/i.test(line)) {
			const cents = summaryLineCents(line);
			if (cents !== null) subtotalCents = cents;
			continue;
		}
		if (/grand\s*total/i.test(line)) {
			const cents = summaryLineCents(line);
			if (cents !== null) totalCents = cents;
			continue;
		}
		if (/\btax\b/i.test(line)) {
			const cents = summaryLineCents(line);
			if (cents !== null) taxCents = cents;
		}
	}

	return {
		merchant: MERCHANT_NAMES.amazon,
		items,
		subtotalCents,
		taxCents,
		totalCents,
		dateIso: extractDateIso(text)
	};
}
