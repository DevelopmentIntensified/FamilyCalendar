/**
 * feedback contract: the zod schemas and types for every `/api` body and
 * response (dates on the wire are ISO strings), and for the `/report-bug`
 * form. Server-side row shapes with real `Date`s live at the bottom.
 *
 * The error copy is the wire: the golden tests pin it
 * (`feedback.http.db.test.ts`). Keep the legacy wording.
 *
 * The vocabularies live in `feedback.rules.ts` (a closed vocabulary is a
 * rule); this file derives their types and parses with them, so there is one
 * home for the six areas and the two sources.
 *
 * Doc: ./README.md#invariants
 */
import {
	isoInstant,
	oneOf,
	optionalText,
	requiredText,
	z
} from '$lib/kernel/validation/validators';
import { BUG_AREAS, isPhraseOverCap, UNMATCHED_SOURCES } from './feedback.rules';

// --- Vocabularies -----------------------------------------------------------

/** One of the six bug-report areas; unknown areas are mapped to `other`. */
export type BugArea = (typeof BUG_AREAS)[number];

/** The parser that could not match a phrase. */
export type UnmatchedSource = (typeof UNMATCHED_SOURCES)[number];

/** Which admin register a call is about; the resolve copy differs per kind. */
export type FeedbackKind = 'bug' | 'phrase';

// --- Wire copy --------------------------------------------------------------

/** The one 400 body `POST /api/bug-report` uses for every validation failure. */
export const BUG_REPORT_INVALID_MESSAGE = `area (one of ${BUG_AREAS.join(', ')}) and description (<=5000 chars) are required`;

/** The one 400 body `POST /api/report-phrase` uses for every validation failure. */
export const PHRASE_INVALID_MESSAGE =
	'phrase (string) and source (event_parse | bulk_edit) are required';

// --- `/api/bug-report` ------------------------------------------------------

/** A non-string url is "no url": the legacy route turned it into '' and stored null. */
const wireUrl = z.preprocess(
	(value) => (typeof value === 'string' ? value : null),
	optionalText()
);

/**
 * `POST /api/bug-report`. The description is trimmed and must be 1..5000; an
 * absent, null, blank or non-string url all become `null` (the writer caps a
 * string url at 2000).
 */
export const BugReportBody = z.object(
	{
		area: oneOf(BUG_AREAS, BUG_REPORT_INVALID_MESSAGE),
		description: requiredText(BUG_REPORT_INVALID_MESSAGE).max(5000, {
			error: BUG_REPORT_INVALID_MESSAGE
		}),
		url: wireUrl
	},
	{ error: BUG_REPORT_INVALID_MESSAGE }
);
export type BugReportBody = z.infer<typeof BugReportBody>;

/** What a file or auto-file writes: the actor supplies the reporter. */
export type BugReportInput = {
	readonly area: BugArea;
	readonly description: string;
	readonly url: string | null;
};

/** `200 {success, id}`. */
export const BugReportFiledResponse = z.object({ success: z.literal(true), id: z.string() });
export type BugReportFiledResponse = z.infer<typeof BugReportFiledResponse>;

// --- `/api/report-phrase` ---------------------------------------------------

/**
 * `POST /api/report-phrase`. The 280 cap runs on the phrase AFTER normalizing
 * (Q-006 answer B): `a` + 280 spaces + `b` is accepted and stores `a b`, while
 * 281 letters are still refused. `matched` is the client's parse sample,
 * stored as JSON text, and absent or null stores `NULL`.
 */
export const UnmatchedPhraseBody = z.object(
	{
		phrase: requiredText(PHRASE_INVALID_MESSAGE).refine((value) => !isPhraseOverCap(value), {
			error: PHRASE_INVALID_MESSAGE
		}),
		source: oneOf(UNMATCHED_SOURCES, PHRASE_INVALID_MESSAGE),
		matched: z.json({ error: PHRASE_INVALID_MESSAGE }).optional()
	},
	{ error: PHRASE_INVALID_MESSAGE }
);
export type UnmatchedPhraseBody = z.infer<typeof UnmatchedPhraseBody>;

/** `200 {success:true}`. */
export const PhraseReportedResponse = z.object({ success: z.literal(true) });
export type PhraseReportedResponse = z.infer<typeof PhraseReportedResponse>;

// --- `/report-bug` page and action -----------------------------------------

/**
 * The `/report-bug` submit action's form. Kept apart from `BugReportBody`:
 * a person gets one message per field, not the single wire body, and the
 * hidden `from` never crosses `/api`.
 */
export const BugReportFormBody = z.object({
	area: oneOf(BUG_AREAS, 'Please choose a category.'),
	description: requiredText('Please describe the bug.').max(5000, {
		error: 'Description is too long (max 5000 characters).'
	}),
	from: optionalText()
});
export type BugReportFormBody = z.infer<typeof BugReportFormBody>;

// --- Admin registers and resolve -------------------------------------------

/** The `id` route parameter both resolve endpoints read. */
export const FeedbackResolveParams = z.object({ id: z.string() });
export type FeedbackResolveParams = z.infer<typeof FeedbackResolveParams>;

// --- Wire rows and responses -----------------------------------------------

/**
 * A bug report as JSON: every timestamp is an ISO string, which is what the
 * wire and the goldens carry. `area` and `status` stay strings because the
 * columns are text: a row outside the vocabulary still renders (the export
 * falls back to the raw area).
 */
export const BugReportResponse = z.object({
	id: z.string(),
	userId: z.string().nullable(),
	area: z.string(),
	description: z.string(),
	url: z.string().nullable(),
	status: z.string(),
	resolvedAt: isoInstant().nullable(),
	createdAt: isoInstant(),
	updatedAt: isoInstant()
});
export type BugReportResponse = z.infer<typeof BugReportResponse>;

/** A register row on the wire: the report plus the reporter's names. */
export const BugReportWithReporterResponse = BugReportResponse.extend({
	reporterFirstName: z.string().nullable(),
	reporterLastName: z.string().nullable()
});
export type BugReportWithReporterResponse = z.infer<typeof BugReportWithReporterResponse>;

/** An unmatched phrase on the wire (`matched` is the stored JSON text). */
export const UnmatchedPhraseResponse = z.object({
	id: z.string(),
	source: z.string(),
	phrase: z.string(),
	sample: z.string(),
	matched: z.string().nullable(),
	count: z.number().int(),
	resolved: z.boolean(),
	createdAt: isoInstant(),
	updatedAt: isoInstant()
});
export type UnmatchedPhraseResponse = z.infer<typeof UnmatchedPhraseResponse>;

/** `GET /api/admin/bugs`; `exportText` covers the open rows only. */
export const BugReportsRegisterResponse = z.object({
	open: z.array(BugReportWithReporterResponse),
	resolved: z.array(BugReportWithReporterResponse),
	exportText: z.string()
});
export type BugReportsRegisterResponse = z.infer<typeof BugReportsRegisterResponse>;

/** `GET /api/admin/nlp`; `exportText` covers the open rows only. */
export const UnmatchedPhrasesRegisterResponse = z.object({
	phrases: z.array(UnmatchedPhraseResponse),
	resolved: z.array(UnmatchedPhraseResponse),
	exportText: z.string()
});
export type UnmatchedPhrasesRegisterResponse = z.infer<typeof UnmatchedPhrasesRegisterResponse>;

/** `POST /api/admin/bugs/[id]/resolve`. */
export const BugReportResolvedResponse = z.object({
	success: z.literal(true),
	report: BugReportResponse
});
export type BugReportResolvedResponse = z.infer<typeof BugReportResolvedResponse>;

/** `POST /api/admin/nlp/[id]/resolve`. */
export const UnmatchedPhraseResolvedResponse = z.object({
	success: z.literal(true),
	phrase: UnmatchedPhraseResponse
});
export type UnmatchedPhraseResolvedResponse = z.infer<typeof UnmatchedPhraseResolvedResponse>;

// --- Server-side row shapes ------------------------------------------------

/**
 * What the repo and the exporters pass around: the same rows with real
 * `Date`s. Never sent directly — the endpoint builders' `ok()` serializes the
 * dates, and the `*Response` schemas above describe the resulting JSON.
 */
export type BugReportView = {
	readonly id: string;
	readonly userId: string | null;
	readonly area: string;
	readonly description: string;
	readonly url: string | null;
	readonly status: string;
	readonly resolvedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
};

/** A register row plus the reporter's names from the `users` left join. */
export type BugReportWithReporter = BugReportView & {
	readonly reporterFirstName: string | null;
	readonly reporterLastName: string | null;
};

/** An unmatched phrase as the register returns it (`matched` is JSON text). */
export type UnmatchedPhraseView = {
	readonly id: string;
	readonly source: string;
	readonly phrase: string;
	readonly sample: string;
	readonly matched: string | null;
	readonly count: number;
	readonly resolved: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
};
