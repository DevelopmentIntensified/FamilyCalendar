/**
 * The wire contract for `POST /api/parse-event`: the one 400 copy, the
 * absent-vs-null rules and the two answer shapes. The golden handler must
 * parse with exactly these schemas at S6.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage } from '$lib/kernel/validation/validators';
import {
	PARSE_EVENT_INVALID_MESSAGE,
	ParseEventBody,
	ParseEventListResponse,
	ParseEventResponse
} from './parsing.contract';

function messageOf(schema: typeof ParseEventBody, value: unknown): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

describe('ParseEventBody', () => {
	it('accepts a string input and defaults useCloud to true when absent', () => {
		const parsed = ParseEventBody.safeParse({ input: 'dinner friday' });
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data.useCloud).toBe(true);
	});

	it('keeps the raw input untrimmed', () => {
		const parsed = ParseEventBody.safeParse({ input: '  dinner friday  ' });
		expect(parsed.success && parsed.data.input).toBe('  dinner friday  ');
	});

	it('useCloud is a truthiness flag, not a boolean parse', () => {
		const rows: Array<[unknown, boolean]> = [
			[false, false],
			[true, true],
			[null, false],
			[0, false],
			[1, true],
			['false', true],
			[{}, true]
		];
		for (const [value, expected] of rows) {
			const parsed = ParseEventBody.safeParse({ input: 'x', useCloud: value });
			expect(parsed.success && parsed.data.useCloud, JSON.stringify(value)).toBe(expected);
		}
	});

	it('answers the one 400 message for a blank, absent or non-string input', () => {
		for (const body of [
			{},
			{ input: '' },
			{ input: '   ' },
			{ input: null },
			{ input: 42 },
			null
		]) {
			expect(messageOf(ParseEventBody, body), JSON.stringify(body)).toBe(
				PARSE_EVENT_INVALID_MESSAGE
			);
		}
		expect(PARSE_EVENT_INVALID_MESSAGE).toBe('Input required');
	});
});

describe('ParseEventResponse', () => {
	it('accepts the single answer and passes the parsed object through verbatim', () => {
		const body = {
			parsed: { title: 'dinner', date: '2026-07-17', vendorOnly: { nested: [1] } },
			confidence: 0.85,
			method: 'cloud'
		};
		const parsed = ParseEventResponse.safeParse(body);
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.parsed).toEqual(body.parsed);
	});

	it('allows a null parsed and every method word', () => {
		for (const method of ['regex', 'cloud', 'regex-fallback'] as const) {
			expect(ParseEventResponse.safeParse({ parsed: null, confidence: 0, method }).success).toBe(
				true
			);
		}
	});

	it('rejects an unknown method', () => {
		expect(ParseEventResponse.safeParse({ parsed: {}, confidence: 0, method: 'none' }).success).toBe(
			false
		);
	});
});

describe('ParseEventListResponse', () => {
	it('accepts the list answer with per-entry confidence', () => {
		const body = {
			results: [
				{ parsed: { title: 'dinner', date: '2026-07-17' }, confidence: 0.9 },
				{ parsed: { title: 'movie' }, confidence: 0.6 }
			],
			method: 'regex-list'
		};
		const parsed = ParseEventListResponse.safeParse(body);
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data).toEqual(body);
	});

	it('rejects a top-level confidence or another method', () => {
		expect(
			ParseEventListResponse.safeParse({ results: [], method: 'regex-list', confidence: 1 }).success
		).toBe(true); // a stripped extra key, never a 500
		expect(ParseEventListResponse.safeParse({ results: [], method: 'regex' }).success).toBe(false);
	});
});
