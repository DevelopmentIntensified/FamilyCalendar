/**
 * feedback contract: the zod schemas and types for every `/api` body and for
 * the `/report-bug` form, plus the response shapes the endpoints return.
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
import { oneOf, optionalText, requiredText, z } from '$lib/kernel/validation/validators';
import { BUG_AREAS, isBugArea, UNMATCHED_SOURCES } from './feedback.rules';

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

/**
 * `POST /api/bug-report`. The description is trimmed and must be 1..5000; an
 * absent, null or blank url all become `null` (the writer caps it at 2000).
 */
export const BugReportBody = z.object(
	{
		area: oneOf(BUG_AREAS, BUG_REPORT_INVALID_MESSAGE),
		description: requiredText(BUG_REPORT_INVALID_MESSAGE).max(5000, {
			error: BUG_REPORT_INVALID_MESSAGE
		}),
		url: optionalText()
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
export type BugReportFiledResponse = {
	readonly success: true;
	readonly id: string;
};

// --- `/api/report-phrase` ---------------------------------------------------

/**
 * `POST /api/report-phrase`. The 280 cap runs on the trimmed phrase before
 * normalization (Q-006); `matched` is the client's parse sample, stored as
 * JSON text, and absent or null stores `NULL`.
 */
export const UnmatchedPhraseBody = z.object(
	{
		phrase: requiredText(PHRASE_INVALID_MESSAGE).max(280, { error: PHRASE_INVALID_MESSAGE }),
		source: oneOf(UNMATCHED_SOURCES, PHRASE_INVALID_MESSAGE),
		matched: z.json({ error: PHRASE_INVALID_MESSAGE }).optional()
	},
	{ error: PHRASE_INVALID_MESSAGE }
);
export type UnmatchedPhraseBody = z.infer<typeof UnmatchedPhraseBody>;

/** `200 {success:true}`. */
export type PhraseReportedResponse = {
	readonly success: true;
};

// --- `/report-bug` page and action -----------------------------------------

/**
 * The `/report-bug` submit action's form. Kept apart from `BugReportBody`:
 * a person gets one message per field, not the single wire body, and the
 * hidden `from` never crosses `/api`.
 */
export const BugReportFormBody = z.object(
	{
		area: z
			.string({ error: 'Please choose a category.' })
			.refine(isBugArea, { error: 'Please choose a category.' }),
		description: requiredText('Please describe the bug.').max(5000, {
			error: 'Description is too long (max 5000 characters).'
		}),
		from: optionalText()
	},
	{ error: 'Please describe the bug.' }
);
export type BugReportFormBody = z.infer<typeof BugReportFormBody>;

// --- Admin registers and resolve -------------------------------------------

/** The `id` route parameter both resolve endpoints read. */
export const FeedbackResolveParams = z.object({ id: z.string() });
export type FeedbackResolveParams = z.infer<typeof FeedbackResolveParams>;

/**
 * A bug report as the registers return it. `area` and `status` stay strings:
 * the columns are text, and a row outside the vocabulary still renders (the
 * export falls back to the raw area).
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

/** `GET /api/admin/bugs`; `exportText` covers the open rows only. */
export type BugReportsRegisterResponse = {
	readonly open: BugReportWithReporter[];
	readonly resolved: BugReportWithReporter[];
	readonly exportText: string;
};

/** `GET /api/admin/nlp`; `exportText` covers the open rows only. */
export type UnmatchedPhrasesRegisterResponse = {
	readonly phrases: UnmatchedPhraseView[];
	readonly resolved: UnmatchedPhraseView[];
	readonly exportText: string;
};

/** `POST /api/admin/bugs/[id]/resolve`. */
export type BugReportResolvedResponse = {
	readonly success: true;
	readonly report: BugReportView;
};

/** `POST /api/admin/nlp/[id]/resolve`. */
export type UnmatchedPhraseResolvedResponse = {
	readonly success: true;
	readonly phrase: UnmatchedPhraseView;
};
