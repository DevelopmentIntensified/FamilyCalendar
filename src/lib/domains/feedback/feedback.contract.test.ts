/**
 * The wire contract: every `/api` body and response schema. The 400 copy and
 * the absent-vs-null rules are the legacy wire, so the golden handlers must
 * parse with exactly these schemas at S6.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, z, type JsonValue } from '$lib/kernel/validation/validators';
import {
	BUG_REPORT_INVALID_MESSAGE,
	BugReportBody,
	BugReportFiledResponse,
	BugReportFormBody,
	BugReportResponse,
	BugReportResolvedResponse,
	BugReportsRegisterResponse,
	PHRASE_INVALID_MESSAGE,
	PhraseReportedResponse,
	UnmatchedPhraseBody,
	UnmatchedPhraseResponse,
	UnmatchedPhraseResolvedResponse,
	UnmatchedPhrasesRegisterResponse
} from './feedback.contract';

function messageOf(schema: z.ZodType, value: unknown): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

const bugReportWire = {
	id: 'b1',
	userId: null,
	area: 'calendar',
	description: 'Event disappeared\nwhen I saved.',
	url: null,
	status: 'open',
	resolvedAt: null as string | null,
	createdAt: '2026-03-02T09:00:00.000Z',
	updatedAt: '2026-03-02T09:00:00.000Z'
};

const phraseWire = {
	id: 'p1',
	source: 'event_parse',
	phrase: 'book dentist',
	sample: 'book dentist',
	matched: '{"title":"Book dentist"}',
	count: 3,
	resolved: false,
	createdAt: '2026-03-01T09:00:00.000Z',
	updatedAt: '2026-03-01T09:00:00.000Z'
};

const validBugReport = { area: 'tasks', description: 'Row vanished', url: '/calendar/tasks' };

describe('BugReportBody', () => {
	it('parses the documented body', () => {
		expect(BugReportBody.parse(validBugReport)).toEqual(validBugReport);
	});

	it('trims the description before the 5000 check', () => {
		const description = BugReportBody.parse({
			area: 'other',
			description: `  ${'x'.repeat(5000)}  `
		}).description;
		expect(description).toHaveLength(5000);
	});

	it('trims a string url but leaves the 2000 cap to the writer', () => {
		const longUrl = `/${'a'.repeat(2100)}`;
		expect(BugReportBody.parse({ ...validBugReport, url: '  /calendar  ' }).url).toBe('/calendar');
		expect(BugReportBody.parse({ ...validBugReport, url: longUrl }).url).toBe(longUrl);
	});

	it.each<[string, JsonValue | undefined]>([
		['absent', undefined],
		['null', null],
		['blank', '   '],
		['a number', 42],
		['a boolean', false],
		['an object', { href: '/calendar' }],
		['an array', []]
	])('stores a %s url as null, like the legacy route', (_label, url) => {
		// `absent` must really omit the key: validBugReport carries a url.
		const { url: _omitted, ...withoutUrl } = validBugReport;
		const body = url === undefined ? withoutUrl : { ...validBugReport, url };
		expect(BugReportBody.parse(body).url).toBeNull();
	});

	it.each<[string, unknown]>([
		['a missing body', undefined],
		['a non-object body', '{'],
		['an array body', []],
		['a missing area', { description: 'x' }],
		['an unknown area', { area: 'weather', description: 'x' }],
		['a differently-cased area', { area: 'Tasks', description: 'x' }],
		['a blank description', { area: 'tasks', description: '   ' }],
		['a description over 5000 chars', { area: 'tasks', description: 'x'.repeat(5001) }]
	])('answers the one 400 copy for %s', (_label, value) => {
		expect(messageOf(BugReportBody, value)).toBe(BUG_REPORT_INVALID_MESSAGE);
	});
});

describe('UnmatchedPhraseBody', () => {
	it('trims the phrase and keeps the posted sample', () => {
		expect(
			UnmatchedPhraseBody.parse({
				phrase: ' Book dentist  tomorrow ',
				source: 'event_parse',
				matched: { title: 'Book dentist' }
			})
		).toEqual({
			phrase: 'Book dentist  tomorrow',
			source: 'event_parse',
			matched: { title: 'Book dentist' }
		});
	});

	it.each<[string, unknown]>([
		['an absent matched', undefined],
		['a null matched', null]
	])('keeps %s absent, so the service stores NULL', (_label, matched) => {
		const body =
			matched === undefined
				? { phrase: 'x', source: 'bulk_edit' }
				: { phrase: 'x', source: 'bulk_edit', matched };
		expect(UnmatchedPhraseBody.parse(body).matched ?? null).toBeNull();
	});

	it('accepts 280 chars and refuses 281 after trimming', () => {
		const body = (phrase: string) => ({ phrase, source: 'event_parse' });
		expect(UnmatchedPhraseBody.safeParse(body('a'.repeat(280))).success).toBe(true);
		expect(messageOf(UnmatchedPhraseBody, body('a'.repeat(281)))).toBe(PHRASE_INVALID_MESSAGE);
	});

	it('refuses a whitespace-heavy phrase over 280 chars before normalizing it (Q-006)', () => {
		expect(
			messageOf(UnmatchedPhraseBody, { phrase: `a${' '.repeat(280)}b`, source: 'event_parse' })
		).toBe(PHRASE_INVALID_MESSAGE);
	});

	it.each<[string, unknown]>([
		['a blank phrase', { phrase: '   ', source: 'event_parse' }],
		['an unknown source', { phrase: 'x', source: 'parser' }],
		['a non-object body', '[]']
	])('answers the one 400 copy for %s', (_label, value) => {
		expect(messageOf(UnmatchedPhraseBody, value)).toBe(PHRASE_INVALID_MESSAGE);
	});
});

describe('BugReportFormBody', () => {
	it('parses the form, with the hidden from absent as null', () => {
		expect(BugReportFormBody.parse({ area: 'calendar', description: ' Event gone ' })).toEqual({
			area: 'calendar',
			description: 'Event gone',
			from: null
		});
	});

	it.each<[string, unknown, string]>([
		['an unknown area', { area: 'weather', description: 'x' }, 'Please choose a category.'],
		['a blank description', { area: 'tasks', description: '  ' }, 'Please describe the bug.'],
		[
			'a description over 5000',
			{ area: 'tasks', description: 'x'.repeat(5001) },
			'Description is too long (max 5000 characters).'
		]
	])('gives the person one message per field for %s', (_label, value, expected) => {
		expect(messageOf(BugReportFormBody, value)).toBe(expected);
	});
});

describe('response schemas', () => {
	it('describes the bug-report wire row with ISO timestamps, never Dates', () => {
		expect(BugReportResponse.parse(bugReportWire)).toEqual(bugReportWire);
		expect(
			BugReportResponse.safeParse({ ...bugReportWire, createdAt: new Date() }).success
		).toBe(false);
		expect(
			BugReportResponse.safeParse({ ...bugReportWire, resolvedAt: new Date() }).success
		).toBe(false);
	});

	it('describes the unmatched-phrase wire row', () => {
		expect(UnmatchedPhraseResponse.parse(phraseWire)).toEqual(phraseWire);
		expect(
			UnmatchedPhraseResponse.safeParse({ ...phraseWire, createdAt: new Date() }).success
		).toBe(false);
	});

	it('describes both registers, including the open-only export text', () => {
		const bugRegister = {
			open: [{ ...bugReportWire, reporterFirstName: 'Mia', reporterLastName: 'Ng' }],
			resolved: [],
			exportText: 'BUG REPORTS EXPORT'
		};
		expect(BugReportsRegisterResponse.parse(bugRegister)).toEqual(bugRegister);
		const phraseRegister = { phrases: [phraseWire], resolved: [], exportText: '' };
		expect(UnmatchedPhrasesRegisterResponse.parse(phraseRegister)).toEqual(phraseRegister);
		expect(
			BugReportsRegisterResponse.safeParse({ open: [], resolved: [], exportText: 1 }).success
		).toBe(false);
	});

	it('describes the resolve and acknowledgement bodies', () => {
		expect(BugReportResolvedResponse.parse({ success: true, report: bugReportWire })).toEqual({
			success: true,
			report: bugReportWire
		});
		expect(UnmatchedPhraseResolvedResponse.parse({ success: true, phrase: phraseWire })).toEqual({
			success: true,
			phrase: phraseWire
		});
		expect(BugReportFiledResponse.parse({ success: true, id: 'b1' })).toEqual({
			success: true,
			id: 'b1'
		});
		expect(PhraseReportedResponse.parse({ success: true })).toEqual({ success: true });
		expect(BugReportFiledResponse.safeParse({ success: 'yes', id: 'b1' }).success).toBe(false);
	});
});
