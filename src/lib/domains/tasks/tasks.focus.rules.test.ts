/**
 * The focus rules as tables: the session time bounds, the `focusStartedAt`
 * field rule and the phone overlay. Expected values come from legacy
 * `taskfocusSessions.ts:70-84,336-355` and `utils/focusStartedAt.ts:11-21`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	focusStartedAtValue,
	sessionTimesError,
	summarizePhoneFocus,
	type TaskPhoneFocusRow
} from './tasks.focus.rules';

const NOW = new Date('2026-03-01T12:00:00.000Z');
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('sessionTimesError', () => {
	const cases: [string, Date, Date | null, string | null][] = [
		['accepts a start in the past', new Date('2026-03-01T11:00:00Z'), null, null],
		['accepts a start exactly 5 minutes ahead', new Date(NOW.getTime() + 5 * MINUTE), null, null],
		[
			'refuses a start beyond 5 minutes ahead',
			new Date(NOW.getTime() + 5 * MINUTE + 1),
			null,
			'startedAt is more than 5 minutes in the future'
		],
		[
			'refuses an end at the start',
			new Date('2026-03-01T10:00:00Z'),
			new Date('2026-03-01T10:00:00Z'),
			'endedAt must be after startedAt'
		],
		[
			'refuses an end before the start',
			new Date('2026-03-01T10:00:00Z'),
			new Date('2026-03-01T09:59:59Z'),
			'endedAt must be after startedAt'
		],
		[
			'accepts a span of exactly 12 hours (bound inclusive)',
			new Date('2026-03-01T00:00:00Z'),
			new Date('2026-03-01T12:00:00Z'),
			null
		],
		[
			'refuses a span beyond 12 hours',
			new Date('2026-03-01T00:00:00Z'),
			new Date('2026-03-01T12:00:01Z'),
			'Session is longer than 12 hours'
		]
	];
	it.each(cases)('%s', (_label, startedAt, endedAt, expected) => {
		expect(sessionTimesError(startedAt, endedAt, NOW)).toBe(expected);
	});

	it('reports the future-start rule before the duration rule', () => {
		expect(
			sessionTimesError(new Date('2026-03-01T13:00:00Z'), new Date('2026-03-01T12:30:00Z'), NOW)
		).toBe('startedAt is more than 5 minutes in the future');
	});
});

describe('focusStartedAtValue', () => {
	const cases: [string, unknown, { ok: true; value: Date | null | undefined } | { ok: false }][] = [
		['absent means unchanged', undefined, { ok: true, value: undefined }],
		['null means stopped', null, { ok: true, value: null }],
		[
			'a parseable string overwrites',
			'2026-03-01T10:00:00.000Z',
			{ ok: true, value: new Date('2026-03-01T10:00:00Z') }
		],
		['a non-string is invalid', 42, { ok: false }],
		['an unparseable string is invalid', 'not-a-date', { ok: false }]
	];
	it.each(cases)('%s', (_label, raw, expected) => {
		expect(focusStartedAtValue(raw)).toEqual(expected);
	});
});

describe('summarizePhoneFocus', () => {
	const at = (iso: string) => new Date(iso);
	const session = (
		taskId: string,
		startedAt: string,
		endedAt: string | null,
		absorbedAt: string | null = null
	): TaskPhoneFocusRow => ({
		taskId,
		startedAt: at(startedAt),
		endedAt: endedAt ? at(endedAt) : null,
		absorbedAt: absorbedAt ? at(absorbedAt) : null
	});

	it('floors the SUMMED duration, not each session (two 90 s sessions = 3 min)', () => {
		const summary = summarizePhoneFocus([
			session('t1', '2026-03-01T10:00:00Z', '2026-03-01T10:01:30Z'),
			session('t1', '2026-03-01T11:00:00Z', '2026-03-01T11:01:30Z')
		]);
		expect(summary.get('t1')?.phoneFocusMinutes).toBe(3);
		expect(summary.get('t1')?.phoneFocusStartedAt).toBeNull();
	});

	it('gives an open session a start and no minutes yet', () => {
		const summary = summarizePhoneFocus([session('t1', '2026-03-01T09:00:00Z', null)]);
		expect(summary.get('t1')).toEqual({
			phoneFocusMinutes: 0,
			phoneFocusStartedAt: at('2026-03-01T09:00:00Z')
		});
	});

	it('keeps the earliest open start when two rows are open', () => {
		const summary = summarizePhoneFocus([
			session('t1', '2026-03-01T11:00:00Z', null),
			session('t1', '2026-03-01T10:00:00Z', null)
		]);
		expect(summary.get('t1')?.phoneFocusStartedAt).toEqual(at('2026-03-01T10:00:00Z'));
	});

	it('ignores absorbed rows and keeps tasks apart', () => {
		const summary = summarizePhoneFocus([
			session('t1', '2026-03-01T10:00:00Z', '2026-03-01T10:05:00Z', '2026-03-02T00:00:00Z'),
			session('t2', '2026-03-01T10:00:00Z', '2026-03-01T10:02:00Z')
		]);
		expect(summary.has('t1')).toBe(false);
		expect(summary.get('t2')?.phoneFocusMinutes).toBe(2);
	});
});
