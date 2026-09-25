/**
 * Digital receipt text extraction (#033). One normalized draft shape with
 * two producers: the Cerebras LLM (invoice-layout-tolerant prompt, strict
 * JSON) and a deterministic regex fallback built on the pure receiptScan
 * heuristics. The output is a HINT for the bills form — a parse is never a
 * commit; the user confirms everything.
 *
 * Pure module: no DB, no network. Routes own the LLM call (DI seam) and
 * the Tag Table lookups.
 */
/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- the whole module is a boundary parser over untyped LLM JSON and pasted text; every field is validated, bounded, or dropped before use, so unknown IS the contract. */
import type { BillCategory } from '$lib/server/db/schema';
import { isBillCategory } from '$lib/data/categories';
import { extractDateIso, extractMerchant, extractTotalCents } from '$lib/utils/receiptScan';
import { detectMerchant, extractMerchantDraft, type MerchantId } from './merchantProfiles';
import type { JsonValue } from './llm';

/** Maximum line items any extraction path may produce (bills cap = 50). */
const MAX_ITEMS = 50;

/** One normalized line item; category null inherits the bill's category. */
export interface ParsedReceiptItem {
	label: string;
	priceCents: number;
	category: BillCategory | null;
	name: string | null;
}

/** The normalized extraction draft every producer returns. */
export interface ReceiptTextDraft {
	merchant: string | null;
	date: string | null;
	items: ParsedReceiptItem[];
	totalCents: number | null;
	source: 'llm' | 'regex';
}

/**
 * The Cerebras extraction prompt. Invoice- AND receipt-layout-tolerant:
 * real digital receipts and forwarded emails range from grocery tickets to
 * formal invoices (bill-to blocks, PO numbers, page footers). The model
 * returns strict JSON; anything unparseable is rejected by
 * normalizeLlmReceipt and the regex fallback takes over.
 */
export const RECEIPT_EXTRACTION_PROMPT = `You extract structured data from pasted receipts, invoices, and order-confirmation emails. Return ONLY a JSON object with these fields:
- "merchant": the store or company name (string or null)
- "total": the grand total INCLUDING tax and fees, as a number in major currency units (e.g. 23.45), or null
- "date": the receipt/invoice date as YYYY-MM-DD, or null
- "currency": ISO currency code if visible, else null
- "taxAmount": the sales tax / VAT / GST amount as a number, or null
- "feeAmount": explicit fees (delivery, service, processing) as a number, or null
- "lineItems": array of {"label": string, "price": number} — one entry per purchased line, EXCLUDING tax and fee lines

IMPORTANT RULES:
- Tolerate any layout: invoices with Bill To / Ship To blocks, order confirmations with tables, plain receipt text. Ignore footers, disclaimers, and account numbers.
- Prices may carry currency symbols or thousands separators; strip them to plain numbers.
- Use "category" on a line item only when it is unambiguously tax ("tax") or fees ("fees"); omit it otherwise.
- Never invent data. Use null for anything not present.`;

/** True when the value is exactly one of the closed BILL_CATEGORIES. */
// (shared guard from $lib/data/categories — arch audit #4)

/** LLM category → closed vocabulary; unknown/absent → null (inherit). */
function mapCategory(raw: unknown): BillCategory | null {
	return isBillCategory(raw) ? raw : null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/** Integer cents from a dollar-amount number; null when unusable. */
function centsFromDollars(raw: unknown): number | null {
	if (!isFiniteNumber(raw) || raw < 0) return null;
	const cents = Math.round(raw * 100);
	return Number.isSafeInteger(cents) && cents <= 2147483647 ? cents : null;
}

/** Integer cents from an integer-cents value; null when unusable. */
function centsFromRawCents(raw: unknown): number | null {
	if (!isFiniteNumber(raw) || !Number.isInteger(raw) || raw < 0) return null;
	return raw <= 2147483647 ? raw : null;
}

function isRecord(value: JsonValue | null): value is { [key: string]: JsonValue } {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEntry(value: unknown): value is { [key: string]: unknown } {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Bounded non-empty label; longer labels are truncated, not dropped. */
function cleanLabel(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	return trimmed.slice(0, 100);
}

function cleanDate(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
}

function cleanMerchant(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	return trimmed.slice(0, 120);
}

/**
 * Validates + normalizes one LLM completion into a draft. Accepts both
 * dollar prices (`price`, `total`) and integer-cents forms (`priceCents`,
 * `totalCents`). Returns null when the payload is not an object or carries
 * nothing usable (no merchant, no items, no total) — the caller then runs
 * the deterministic fallback.
 */
export function normalizeLlmReceipt(json: JsonValue | null): ReceiptTextDraft | null {
	if (!isRecord(json)) return null;

	const merchant = cleanMerchant(json.merchant);
	const date = cleanDate(json.date);

	const items: ParsedReceiptItem[] = [];
	if (Array.isArray(json.lineItems)) {
		for (const entry of json.lineItems) {
			if (items.length >= MAX_ITEMS) break;
			if (!isEntry(entry)) continue;
			const label = cleanLabel(entry.label);
			if (!label) continue;
			const priceCents = centsFromDollars(entry.price) ?? centsFromRawCents(entry.priceCents);
			if (priceCents === null) continue;
			items.push({ label, priceCents, category: mapCategory(entry.category), name: null });
		}
	}
	// The prompt asks for tax/fees as summary fields; surface them as their
	// own line items so Spend Detail sees tax/fees categories (#031) — but
	// never twice: an LLM that already labeled a tax/fee lineItem wins.
	const hasItemCategory = (category: BillCategory): boolean =>
		items.some((item) => item.category === category);
	const taxCents = centsFromDollars(json.taxAmount) ?? centsFromRawCents(json.taxAmountCents);
	if (taxCents !== null && taxCents > 0 && !hasItemCategory('tax') && items.length < MAX_ITEMS) {
		items.push({ label: 'Sales tax', priceCents: taxCents, category: 'tax', name: null });
	}
	const feeCents = centsFromDollars(json.feeAmount) ?? centsFromRawCents(json.feeAmountCents);
	if (feeCents !== null && feeCents > 0 && !hasItemCategory('fees') && items.length < MAX_ITEMS) {
		items.push({ label: 'Fees', priceCents: feeCents, category: 'fees', name: null });
	}

	let totalCents =
		centsFromDollars(json.total) ??
		centsFromRawCents(json.totalCents) ??
		(items.length > 0 ? items.reduce((sum, item) => sum + item.priceCents, 0) : null);

	if (!merchant && items.length === 0 && totalCents === null) return null;
	if (totalCents === null) totalCents = null;

	return { merchant, date, items, totalCents, source: 'llm' };
}

/* ── Deterministic regex fallback ───────────────────────────────────────
 * Row-shape heuristics over pasted text lines: "description … $price".
 * Total/date/merchant reuse the receiptScan extractors (same logic as the
 * photo scan path). Works with NO LLM configured.
 */

/** A trailing price at the end of a line (optionally currency-prefixed). */
const TRAILING_PRICE_RE = /[\s·•.:—–-]+\$?(?<price>\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*$/;

/** Summary rows that must never become line items. */
const SUMMARY_ROW_RE =
	/(subtotal|total|amount|balance|due|change|tender|tended|cash|card|payment|paid|gift card|tip|previous|visa|mastercard|amex|discover|approval|auth|order #|invoice #|bill to|ship to|po box|www\.|http)/i;

/** Tax-family rows: labeled as their own 'tax' category item. */
const TAX_ROW_RE = /\b(tax|taxes|vat|gst)\b/i;

/** Fee-family rows: labeled as their own 'fees' category item. */
const FEE_ROW_RE = /\b(fees?|surcharge)\b/i;

/**
 * The last total-line amount (receiptScan semantics minus the largest-
 * amount fallback): null when no total/amount/balance/due line exists —
 * the caller then prefers the sum of parsed items.
 */
function lastTotalLineCents(lines: string[]): number | null {
	let last: number | null = null;
	for (const line of lines) {
		if (/(subtotal|change|tender|previous|gift card|tip)/i.test(line)) continue;
		if (!/(total|amount|balance|due)/i.test(line)) continue;
		const amounts: number[] = [];
		for (const match of line.matchAll(
			/(?:\$|USD\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})(?!\d)/g
		)) {
			const value = Number(match[1].replace(/[$,\s]/g, ''));
			if (Number.isFinite(value)) amounts.push(Math.round(value * 100));
		}
		if (amounts.length > 0) last = Math.max(...amounts);
	}
	return last;
}

/** Bounded label from the row's description half; null when unusable. */
function cleanItemLabel(desc: string): string | null {
	const trimmed = desc.replace(/[\s·•.:—–-]+$/, '').trim();
	if (trimmed.length < 2 || trimmed.length > 60) return null;
	// A usable item label has at least one letter (drops bare numbers,
	// phone-number rows, and scan artifacts).
	if (!/[a-z]/i.test(trimmed)) return null;
	return trimmed.slice(0, 100);
}

/**
 * Converts a #034 merchant draft into the standard regex-draft shape:
 * merchandise rows inherit the bill's category (null), the house tax total
 * surfaces as its own 'tax' line item (#031: never absorbed into the
 * merchant's category), and the total is the house total line else the sum
 * of parsed items.
 */
function merchantDraftToRegexDraft(merchant: MerchantId, text: string): ReceiptTextDraft {
	const draft = extractMerchantDraft(text, merchant);
	const items: ParsedReceiptItem[] = draft.items.map((item) => ({
		label: item.label,
		priceCents: item.priceCents,
		category: null,
		name: null
	}));
	if (draft.taxCents !== null && draft.taxCents > 0 && items.length < MAX_ITEMS) {
		items.push({ label: 'Sales tax', priceCents: draft.taxCents, category: 'tax', name: null });
	}
	const totalCents =
		draft.totalCents ??
		(items.length > 0 ? items.reduce((sum, item) => sum + item.priceCents, 0) : null);
	return { merchant: draft.merchant, date: draft.dateIso, items, totalCents, source: 'regex' };
}

/**
 * Deterministic extraction over pasted receipt/invoice text: a recognized
 * big-box layout (#034) goes through its merchant extractor first; anything
 * else takes the generic `description … price` row path below (unchanged).
 * Merchant is the top non-noise line, line items are `description … price`
 * rows (tax and fee rows labeled as such), the total is the last total-line
 * amount (else the sum of items), and the date via the receiptScan parsers.
 */
export function extractReceiptRegex(text: string): ReceiptTextDraft {
	const merchantId = detectMerchant(text);
	if (merchantId) return merchantDraftToRegexDraft(merchantId, text);

	const lines = text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const items: ParsedReceiptItem[] = [];
	for (const line of lines) {
		if (items.length >= MAX_ITEMS) break;
		const match = line.match(TRAILING_PRICE_RE);
		if (!match?.groups) continue;
		const priceCents = centsFromDollars(Number(match.groups.price.replace(/,/g, '')));
		if (priceCents === null || priceCents === 0) continue;
		if (SUMMARY_ROW_RE.test(line)) continue;
		const label = cleanItemLabel(line.slice(0, match.index));
		if (!label) continue;
		// Tax/fees sit FIRST (#031): explicit tax/fee rows are labeled as
		// such, never absorbed into the merchant's category.
		const category: BillCategory | null = TAX_ROW_RE.test(label)
			? 'tax'
			: FEE_ROW_RE.test(label)
				? 'fees'
				: null;
		items.push({ label, priceCents, category, name: null });
	}

	// Total precedence: a real total line → the sum of parsed items → the
	// receiptScan fallback (largest amount anywhere).
	const extractedTotal = lastTotalLineCents(lines);
	const totalCents =
		extractedTotal !== null
			? extractedTotal
			: items.length > 0
				? items.reduce((sum, item) => sum + item.priceCents, 0)
				: extractTotalCents(text);

	return {
		merchant: extractMerchant(text),
		date: extractDateIso(text),
		items,
		totalCents,
		source: 'regex'
	};
}
