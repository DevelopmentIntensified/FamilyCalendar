/**
 * The closed bill-category vocabulary + shared merchant keyword table
 * (architecture audit candidate #4). CLIENT-SAFE: zero server imports —
 * schema re-exports BILL_CATEGORIES from here (server-only chain broken),
 * and every consumer (schema, receiptScan, receiptOcr, NLP, bills actions,
 * receiptText, email-ingest) reads this one copy, so the vocabulary and
 * keyword table can no longer drift.
 *
 * Category term (CONTEXT.md): housing, utilities, subscriptions,
 * insurance, tax, fees, other. Tax and fees are their own categories —
 * a receipt's tax/fee lines are labeled as such, never absorbed into the
 * merchant's category.
 */

export const BILL_CATEGORIES = [
	'housing',
	'utilities',
	'subscriptions',
	'insurance',
	// Tax and fees are their own categories (#031): a receipt's tax/fee
	// lines are labeled as such, never absorbed into the merchant's category.
	'tax',
	'fees',
	'other'
] as const;

export type BillCategory = (typeof BILL_CATEGORIES)[number];

const BILL_CATEGORY_SET: ReadonlySet<string> = new Set(BILL_CATEGORIES);

/** True when the value is exactly one of the closed BILL_CATEGORIES. */
export function isBillCategory(value: unknown): value is BillCategory {
	return typeof value === 'string' && BILL_CATEGORY_SET.has(value);
}

/**
 * The ORDERED merchant/keyword table (first matching entry wins): the
 * de-duplicated UNION of receiptScan's and naturalLanguageService's two
 * diverging tables (plus receiptText's tax/fee regex words, already
 * covered). Tax/fees sit FIRST (#031): explicit tax/fee words must win
 * over merchant words so receipt tax/fee lines are labeled as such, never
 * absorbed. Subscriptions precede insurance so "youtube premium" reads
 * subscriptions, not premium→insurance.
 *
 * 'oil' is deliberately NOT a bare keyword (SHELL OIL FUEL is a gas
 * station, not a utility — receiptScan's table encoded this); only the
 * "heating oil" phrase matches.
 */
export const CATEGORY_KEYWORDS: ReadonlyArray<{ words: string[]; category: BillCategory }> = [
	{ words: ['tax', 'taxes', 'sales tax', 'vat', 'gst'], category: 'tax' },
	{ words: ['fee', 'fees', 'surcharge'], category: 'fees' },
	{
		words: [
			'electric',
			'electricity',
			'power',
			'water',
			'sewer',
			'sewage',
			'gas',
			'gas service',
			'gas co',
			'utility',
			'utilities',
			'internet',
			'broadband',
			'wifi',
			'cable',
			'trash',
			'garbage',
			'recycling',
			'phone',
			'mobile',
			'heating',
			'propane',
			'heating oil',
			'comcast',
			'xfinity',
			'spectrum',
			'verizon',
			'at&t',
			'duke energy',
			'national grid',
			'pg&e'
		],
		category: 'utilities'
	},
	{
		words: [
			'netflix',
			'spotify',
			'hulu',
			'hbo',
			'max',
			'disney',
			'youtube',
			'icloud',
			'adobe',
			'microsoft',
			'google one',
			'dropbox',
			'membership',
			'subscription',
			'prime',
			'audible',
			'sirius',
			'crunchyroll',
			'apple'
		],
		category: 'subscriptions'
	},
	{
		words: [
			'insurance',
			'geico',
			'allstate',
			'state farm',
			'progressive',
			'usaa',
			'premium',
			'liberty mutual'
		],
		category: 'insurance'
	},
	{
		words: [
			'rent',
			'rental',
			'rentals',
			'mortgage',
			'hoa',
			'housing',
			'landlord',
			'lease',
			'leasing',
			'property management',
			'home depot',
			"lowe's",
			'lowes',
			'hardware',
			'plumbing'
		],
		category: 'housing'
	}
];

/** Word-boundary regex per keyword (case-insensitive; phrases included). */
const COMPILED: ReadonlyArray<{ category: BillCategory; regexes: RegExp[] }> =
	CATEGORY_KEYWORDS.map((entry) => ({
		category: entry.category,
		regexes: entry.words.map((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i'))
	}));

function escapeRegExp(word: string): string {
	return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * First table entry with a word-boundary keyword match in the text; null
 * when nothing matches (callers fall back to 'other'). `exclude` skips
 * whole entries — receiptScan's multi-line receipt scans exclude tax/fees
 * (#031: every receipt prints a TAX summary line, so applying them to a
 * whole receipt would absorb every grocery bill into 'tax').
 */
export function categoryForKeyword(
	text: string,
	exclude?: ReadonlyArray<BillCategory>
): BillCategory | null {
	for (const entry of COMPILED) {
		if (exclude?.includes(entry.category)) continue;
		if (entry.regexes.some((regex) => regex.test(text))) return entry.category;
	}
	return null;
}
