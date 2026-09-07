/**
 * Local-OCR receipt extraction heuristics (issue 010). All functions are
 * PURE and take already-recognized OCR text — tesseract.js lives in the
 * worker and only feeds text in, so tests run without any OCR dependency.
 *
 * CLIENT-SAFE: mirrors schema's BILL_CATEGORIES as a local union (importing
 * $lib/server/db/schema into client code is forbidden); keep in sync.
 */
export type BillCategory = 'housing' | 'utilities' | 'subscriptions' | 'insurance' | 'other';

/** A currency amount like $12.34, 1,450.00, 8.27 (no bare integers). */
const MONEY_RE = /(?:\$|USD\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})(?!\d)/g;

/** Header/summary lines that can never be the merchant name. */
const NOISE_LINE_RE =
	/^(receipt|invoice|guest check|order|store|reg|txnr|account|customer|tenant|date|time|total|subtotal|tax|change|cash|card|payment|paid|balance|amount|policy|thank you|welcome|please|p\.?o\.? box|www\.|http)/i;

/** Lines that suppress total extraction (subtotals, tenders, change). */
const NOT_A_TOTAL_RE = /(subtotal|change|tender|previous|gift card|tip)/i;

/** Total-family keywords; 'due' catches AMOUNT DUE / TOTAL DUE. */
const TOTAL_RE = /(total|amount|balance|due)/i;

/** Merchant→category keyword table (word-boundary matched, lowercase). */
const CATEGORY_KEYWORDS: ReadonlyArray<[BillCategory, RegExp]> = [
	[
		'utilities',
		/\b(electric|power|water|sewage|sewer|utility|utilities|internet|cable|wifi|comcast|xfinity|spectrum|verizon|at&t|gas service|gas co\b|duke energy|national grid|pg&e)\b/
	],
	[
		'subscriptions',
		/\b(netflix|spotify|hulu|hbo|max|disney|youtube|icloud|adobe|microsoft|google one|dropbox|membership|subscription)\b/
	],
	['insurance', /\b(insurance|geico|allstate|state farm|progressive|usaa|premium)\b/],
	[
		'housing',
		/\b(rent|landlord|property management|mortgage|home depot|lowe's|lowes|hardware|plumbing|leasing)\b/
	]
];

function lines(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

/** Parses the first money match on a line into integer cents. */
function lineAmounts(line: string): number[] {
	const amounts: number[] = [];
	for (const match of line.matchAll(MONEY_RE)) {
		const value = Number(match[1].replace(/[$,\s]/g, ''));
		if (Number.isFinite(value)) amounts.push(Math.round(value * 100));
	}
	return amounts;
}

/**
 * The merchant is the top non-noise line: not a header word, not an
 * address (digit-led), and carrying at least three letters.
 */
export function extractMerchant(text: string): string | null {
	for (const line of lines(text)) {
		if (NOISE_LINE_RE.test(line)) continue;
		// Merchant names are letter-led; symbol/parenthesis-led lines are scan
		// artifacts ("(scan failed) 0.00"), digit-led ones are addresses/dates.
		if (!/^[a-z]/i.test(line)) continue;
		const letters = (line.match(/[a-z]/gi) ?? []).length;
		if (letters < 3) continue;
		return line;
	}
	return null;
}

/**
 * Integer cents of the receipt total: the last amount on a total/amount/
 * balance/due line (excluding subtotals, tips, change), else the largest
 * amount anywhere. Null when nothing usable (including $0.00-only junk).
 */
export function extractTotalCents(text: string): number | null {
	const totalish: number[] = [];
	for (const line of lines(text)) {
		if (NOT_A_TOTAL_RE.test(line) || !TOTAL_RE.test(line)) continue;
		const amounts = lineAmounts(line);
		if (amounts.length > 0) totalish.push(Math.max(...amounts));
	}

	if (totalish.length === 0) {
		// Fallback: largest amount on any line without total keywords.
		const all = lines(text).flatMap(lineAmounts);
		const largest = all.length > 0 ? Math.max(...all) : null;
		return largest && largest > 0 ? largest : null;
	}

	return totalish[totalish.length - 1];
}

/**
 * First recognizable receipt date as ISO yyyy-MM-dd: ISO dash form,
 * US slash form (MM/DD/YY — America-first on the slash ambiguity), or
 * "Sep 6, 2026" month-name forms.
 */
export function extractDateIso(text: string): string | null {
	for (const line of lines(text)) {
		const iso = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
		if (iso) {
			const [, y, m, d] = iso;
			return `${y}-${m}-${d}`;
		}
		const slash = line.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
		if (slash) {
			const month = Number(slash[1]);
			const day = Number(slash[2]);
			let year = Number(slash[3]);
			if (year < 100) year += 2000;
			if (month < 1 || month > 12 || day < 1 || day > 31) continue;
			return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		}
		const named = line.match(
			/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i
		);
		if (named) {
			// SAFETY: the regex only matches month names in this table, so the
			// 3-letter lowercase slice is always a MONTHS key.
			const MONTHS = {
				jan: 1,
				feb: 2,
				mar: 3,
				apr: 4,
				may: 5,
				jun: 6,
				jul: 7,
				aug: 8,
				sep: 9,
				oct: 10,
				nov: 11,
				dec: 12
			} as const;
			// SAFETY: the regex only matches month names in this table, so the
			// 3-letter lowercase slice is always a MONTHS key.
			const month = MONTHS[named[1].toLowerCase().slice(0, 3) as keyof typeof MONTHS];
			const day = Number(named[2]);
			if (!month || day < 1 || day > 31) continue;
			return `${named[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		}
	}
	return null;
}

/** Merchant keyword → BILL_CATEGORIES; 'other' fallback. */
export function suggestCategory(text: string): BillCategory {
	const lower = text.toLowerCase();
	for (const [category, keywords] of CATEGORY_KEYWORDS) {
		if (keywords.test(lower)) return category;
	}
	return 'other';
}

export interface ReceiptScanResult {
	merchant: string | null;
	totalCents: number | null;
	dateIso: string | null;
	category: BillCategory;
}

/**
 * The opt-in cloud scan (Azure, issue 010) normalized to the SAME shape as
 * the local scan (`date` mirrors `dateIso`; line items are text-only — the
 * image itself is deleted by Azure within 24h, #029).
 */
export interface CloudReceiptScan {
	merchant: string | null;
	totalCents: number | null;
	date: string | null;
	lineItems: Array<{ label: string; priceCents: number }> | null;
	category: BillCategory;
}

/** Aggregates all extractors over one receipt's OCR text. */
export function scanReceipt(text: string): ReceiptScanResult {
	return {
		merchant: extractMerchant(text),
		totalCents: extractTotalCents(text),
		dateIso: extractDateIso(text),
		category: suggestCategory(text)
	};
}

/**
 * Poor-extraction gate for the cloud fallback: nothing usable came out
 * when the text is empty, or neither a merchant nor a total was found.
 */
export function isPoorExtraction(text: string, result: ReceiptScanResult): boolean {
	return text.trim() === '' || (!result.merchant && result.totalCents === null);
}
