/**
 * Pure rules for the Alert vocabulary: the closed five-type set, the
 * needs-you / news split, labels, tones, glyphs, and the decode of a stored
 * row. Expected values come from CONTEXT.md (the five types, the grouping) and
 * the README Invariants, never from running the code. Carried over from
 * `src/lib/utils/notificationTypes.test.ts` (cases named inline).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { AlertRow, AlertType, StoredAlertRow } from './alerts.contract';
import {
	ALERT_GROUPS,
	ALERT_TYPES,
	alertGlyph,
	alertGroup,
	alertLabel,
	alertTone,
	DECISION_TYPES,
	isAlertType,
	toAlertRow,
	UNKNOWN_ALERT_LABEL,
	unrecognisedAlertTypes
} from './alerts.vocabulary.rules';

// `notifications.type` is free text in the column, so every function takes a
// plain string and must cope with a value nobody wrote.
const UNKNOWN = 'task_completed_v2';

function aRow(over: Partial<AlertRow> = {}): AlertRow {
	return {
		id: 'n1',
		type: 'task_completed',
		rawType: 'task_completed',
		group: 'news',
		actorName: 'Sarah',
		message: 'completed "Weekly meal plan"',
		link: '/calendar/tasks',
		readAt: null,
		createdAt: '2026-09-30T09:00:00.000Z',
		...over
	};
}

describe('the closed type set', () => {
	// notificationTypes.test.ts:42 "is exactly the five-member union"
	it('is exactly the five-member union', () => {
		expect(ALERT_TYPES).toEqual([
			'assignment_pending',
			'assignment_accepted',
			'assignment_declined',
			'task_completed',
			'added_to_family'
		]);
	});

	it('keeps the two section names in render order', () => {
		expect(ALERT_GROUPS).toEqual(['needs_you', 'news']);
	});

	// notificationTypes.test.ts:38,52,58 "accepts every type", "rejects an unrecognised type string", "rejects non-strings"
	it.each<[string, unknown, boolean]>([
		['assignment_pending', 'assignment_pending', true],
		['assignment_accepted', 'assignment_accepted', true],
		['assignment_declined', 'assignment_declined', true],
		['task_completed', 'task_completed', true],
		['added_to_family', 'added_to_family', true],
		['an unrecognised string', UNKNOWN, false],
		['the empty string', '', false],
		['a case variant', 'Task_Completed', false],
		['an upper-case variant', 'TASK_COMPLETED', false],
		['a padded value', ' task_completed ', false],
		['null', null, false],
		['undefined', undefined, false],
		['a number', 3, false],
		['an object', { type: 'task_completed' }, false]
	])('isAlertType(%s)', (_label, value, expected) => {
		expect(isAlertType(value)).toBe(expected);
	});
});

describe('alertGroup: needs you versus news', () => {
	// notificationTypes.test.ts:66 "puts only the two asking types in needs-you"
	it('names exactly the two asking types as the decisions', () => {
		expect(DECISION_TYPES).toEqual(['assignment_pending', 'assignment_declined']);
	});

	// notificationTypes.test.ts:66-76
	it.each<[AlertType, 'needs_you' | 'news']>([
		['assignment_pending', 'needs_you'],
		['assignment_declined', 'needs_you'],
		['assignment_accepted', 'news'],
		['task_completed', 'news'],
		['added_to_family', 'news']
	])('puts %s in %s', (type, group) => {
		expect(alertGroup(type)).toBe(group);
	});

	// notificationTypes.test.ts:78 "never lets an unrecognised type claim to need a decision"
	it.each<[string, string]>([
		['an unrecognised type', UNKNOWN],
		['the empty string', ''],
		['a case variant of a decision type', 'Assignment_Pending']
	])('never lets %s claim to need a decision', (_label, type) => {
		expect(alertGroup(type)).toBe('news');
	});
});

describe('labels, tones and glyphs', () => {
	// notificationTypes.test.ts:85 "gives all five a human label"
	it.each<[AlertType, string]>([
		['assignment_pending', 'Asked you'],
		['assignment_accepted', 'Accepted'],
		['assignment_declined', 'Declined'],
		['task_completed', 'Completed'],
		['added_to_family', 'Added to family']
	])('labels %s as %s', (type, label) => {
		expect(alertLabel(type)).toBe(label);
	});

	// notificationTypes.test.ts:93 "labels an unrecognised type explicitly rather than echoing the raw string"
	it('labels an unrecognised type as Update rather than echoing the raw string', () => {
		expect(UNKNOWN_ALERT_LABEL).toBe('Update');
		expect(alertLabel(UNKNOWN)).toBe('Update');
		expect(alertLabel(UNKNOWN)).not.toBe(UNKNOWN);
		expect(alertLabel('')).toBe('Update');
	});

	// notificationTypes.test.ts:100 "gives every known type a non-empty tone and glyph"
	it.each([...ALERT_TYPES])('gives %s a tone and a glyph', (type) => {
		expect(alertTone(type)).toMatch(/^bg-/);
		expect(alertGlyph(type)).not.toBe('');
	});

	// notificationTypes.test.ts:107 "falls back to a neutral tone and glyph for an unknown type"
	it('falls back to a neutral slate tone and a glyph for an unrecognised type', () => {
		expect(alertTone(UNKNOWN)).toMatch(/^bg-slate-/);
		expect(alertGlyph(UNKNOWN)).not.toBe('');
	});
});

describe('toAlertRow: the guard at the boundary', () => {
	const stored: StoredAlertRow = {
		id: 'n1',
		type: 'assignment_pending',
		actorName: 'Sarah',
		message: 'asked you to book the climbing wall',
		link: '/calendar/tasks',
		readAt: null,
		createdAt: '2026-09-30T09:00:00.000Z'
	};

	// notificationTypes.test.ts:124 "narrows a known type and carries the group with it"
	it('narrows a known type and carries the group with it', () => {
		expect(toAlertRow(stored)).toEqual({
			id: 'n1',
			type: 'assignment_pending',
			rawType: 'assignment_pending',
			group: 'needs_you',
			actorName: 'Sarah',
			message: 'asked you to book the climbing wall',
			link: '/calendar/tasks',
			readAt: null,
			createdAt: '2026-09-30T09:00:00.000Z'
		});
	});

	// notificationTypes.test.ts:132 "keeps an unrecognised row rather than dropping or crashing on it"
	it('keeps an unrecognised row rather than dropping or crashing on it', () => {
		const row = toAlertRow({ ...stored, type: UNKNOWN });
		expect(row.id).toBe('n1');
		expect(row.type).toBeNull();
		expect(row.rawType).toBe(UNKNOWN);
		expect(row.group).toBe('news');
	});

	// notificationTypes.test.ts:140 "normalises a null link and readAt instead of leaking nulls into href"
	it.each<[string, Pick<StoredAlertRow, 'link' | 'readAt'>]>([
		['null', { link: null, readAt: null }],
		['absent', {}]
	])('normalises an %s link and readAt to null', (_label, missing) => {
		const row = toAlertRow({
			id: 'n1',
			type: 'task_completed',
			actorName: 'Sam',
			message: 'completed the bins',
			createdAt: '2026-09-30T09:00:00.000Z',
			...missing
		});
		expect(row.link).toBeNull();
		expect(row.readAt).toBeNull();
	});

	it('keeps a link and a read time that are there', () => {
		const row = toAlertRow({
			...stored,
			link: '/calendar/family',
			readAt: '2026-09-30 10:00:00+00'
		});
		expect(row.link).toBe('/calendar/family');
		expect(row.readAt).toBe('2026-09-30 10:00:00+00');
	});
});

describe('unrecognisedAlertTypes: what the page load logs', () => {
	it('lists each unrecognised raw type once, in first-seen order', () => {
		const rows = [
			aRow({ id: 'a', type: null, rawType: 'mystery_type' }),
			aRow({ id: 'b' }),
			aRow({ id: 'c', type: null, rawType: 'other_type' }),
			aRow({ id: 'd', type: null, rawType: 'mystery_type' })
		];
		expect(unrecognisedAlertTypes(rows)).toEqual(['mystery_type', 'other_type']);
	});

	it('is empty when every row is one of the five', () => {
		expect(unrecognisedAlertTypes([aRow(), aRow({ id: 'n2' })])).toEqual([]);
		expect(unrecognisedAlertTypes([])).toEqual([]);
	});
});
