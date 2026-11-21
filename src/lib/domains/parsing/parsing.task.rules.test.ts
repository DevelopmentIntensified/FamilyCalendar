/**
 * The Task quick-add grammar: the shared parse vectors (lockstep with the
 * Android suite) plus the phrase table. Carries
 * `src/lib/utils/taskQuickAdd.test.ts`.
 *
 * The vector file stays at the repo root and is imported IN PLACE — never
 * copied into the module, because the Android suite finds it by walking the
 * tree. `EXPECTED_VECTORS` gates drift.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import vectors from '../../../../shared/parse-vectors.json';
import {
	findTaskAssignee,
	parseTaskQuickAdd,
	type TaskQuickAddMember
} from './parsing.task.rules';

const NOW = new Date('2026-08-28T10:00:00.000Z'); // a Friday
const ZONE = 'UTC';

const ROSTER: TaskQuickAddMember[] = [
	{ userId: 'u-sam', firstName: 'Sam', lastName: 'Rivera' },
	{ userId: 'u-mom', firstName: 'Mom', lastName: '' },
	{ userId: 'u-dad', firstName: 'Dad', lastName: 'Chen' }
];

function parse(phrase: string, members?: TaskQuickAddMember[]) {
	return parseTaskQuickAdd(phrase, members ? { now: NOW, zone: ZONE, members } : { now: NOW, zone: ZONE });
}

interface Due {
	days?: number;
	date?: string;
}

interface Vector {
	phrase: string;
	roster?: string;
	title?: string;
	/** JSON imports widen literals to `string`; the assertions compare values. */
	priority?: string;
	due?: Due | null;
	assignedTo?: string | null;
	unknownMember?: string | null;
	tags?: string[];
	recurrence?: { frequency: string | null; interval: number | null } | null;
	visibility?: string;
	visibilityExplicit?: boolean;
	familyTask?: boolean;
	findAssignee?: { userId: string; length?: number } | null;
}

interface Section {
	id: string;
	title: string;
	vectors: Vector[];
}

interface VectorsFile {
	now: string;
	nowDate: string;
	rosters: Record<string, TaskQuickAddMember[]>;
	sections: Section[];
}

const VECTORS: VectorsFile = vectors;

/** Kept in lockstep with the Android suite's count — drift fails both. */
const EXPECTED_VECTORS = 145;

/** Local midnight of a date — tz-proof way to compare "which day" a due lands on. */
function startOfLocalDay(d: Date): Date {
	const c = new Date(d);
	c.setHours(0, 0, 0, 0);
	return c;
}

function daysAfter(base: Date, n: number): Date {
	const c = new Date(base);
	c.setDate(c.getDate() + n);
	return startOfLocalDay(c);
}

/** Parse a `YYYY-MM-DD` vector date as LOCAL midnight (never UTC). */
function localDate(iso: string): Date {
	const [year, month, day] = iso.split('-').map(Number);
	return new Date(year, month - 1, day);
}

/** Assert the due lands on the expected LOCAL day, pinned to end-of-day. */
function assertDue(result: { dueDate: string | null }, due: Due | null) {
	if (due === null) {
		expect(result.dueDate).toBeNull();
		return;
	}
	expect(result.dueDate).not.toBeNull();
	const actual = new Date(result.dueDate!);
	const expected =
		due.days !== undefined ? daysAfter(NOW, due.days) : startOfLocalDay(localDate(due.date!));
	expect(startOfLocalDay(actual)).toEqual(expected);
	// Original parser pins the due time to end-of-day, local.
	expect(actual.getHours()).toBe(23);
	expect(actual.getMinutes()).toBe(59);
}

function assertVector(vector: Vector) {
	const roster = vector.roster === undefined ? undefined : VECTORS.rosters[vector.roster];

	if (vector.findAssignee !== undefined) {
		const match = findTaskAssignee(vector.phrase, roster ?? []);
		if (vector.findAssignee === null) {
			expect(match).toBeNull();
			return;
		}
		expect(match?.userId).toBe(vector.findAssignee.userId);
		if (vector.findAssignee.length !== undefined) {
			expect(match?.length).toBe(vector.findAssignee.length);
		}
		return;
	}

	const result = parse(vector.phrase, roster);
	if (vector.title !== undefined) expect(result.title).toBe(vector.title);
	if (vector.priority !== undefined) expect(result.priority).toBe(vector.priority);
	if (vector.due !== undefined) assertDue(result, vector.due);
	if (vector.assignedTo !== undefined) expect(result.assignedTo).toBe(vector.assignedTo);
	if (vector.unknownMember !== undefined) expect(result.unknownMember).toBe(vector.unknownMember);
	if (vector.tags !== undefined) expect(result.tags).toEqual(vector.tags);
	if (vector.recurrence !== undefined) {
		expect(result.recurrenceFrequency).toBe(vector.recurrence?.frequency ?? null);
		expect(result.recurrenceInterval).toBe(vector.recurrence?.interval ?? null);
	}
	if (vector.visibility !== undefined) expect(result.visibility).toBe(vector.visibility);
	if (vector.visibilityExplicit !== undefined) {
		expect(result.visibilityExplicit).toBe(vector.visibilityExplicit);
	}
	if (vector.familyTask !== undefined) expect(result.familyTask).toBe(vector.familyTask);
}

describe('shared parse vectors (shared/parse-vectors.json)', () => {
	it('pins the NOW context the Android suite mirrors', () => {
		expect(NOW.toISOString()).toBe(VECTORS.now);
		expect(VECTORS.nowDate).toBe('2026-08-28');
	});

	it('matches the expected case count', () => {
		const total = VECTORS.sections.reduce((n, section) => n + section.vectors.length, 0);
		expect(total).toBe(EXPECTED_VECTORS);
	});
});

for (const section of VECTORS.sections) {
	describe(section.title, () => {
		it.each(section.vectors)('$phrase', (vector) => {
			assertVector(vector);
		});
	});
}

describe('due-date phrases — 23:59 in the caller zone', () => {
	const rows: Array<[string, string]> = [
		['buy milk tomorrow', '2026-08-29T23:59:00.000Z'],
		['call mom today', '2026-08-28T23:59:00.000Z'],
		['submit form in 3 days', '2026-08-31T23:59:00.000Z'],
		['submit form in a week', '2026-09-04T23:59:00.000Z'],
		['renew next month', '2026-09-28T23:59:00.000Z'],
		['renew next year', '2027-08-28T23:59:00.000Z'],
		['file taxes jan 5', '2027-01-05T23:59:00.000Z'],
		['card for feb 14, 2027', '2027-02-14T23:59:00.000Z']
	];

	it.each(rows)('%s → %s', (phrase, expected) => {
		expect(parse(phrase).dueDate).toBe(expected);
	});

	it('a weekday named on that weekday means next week', () => {
		expect(parse('call friday').dueDate).toBe('2026-09-04T23:59:00.000Z');
		expect(parse('call next friday').dueDate).toBe('2026-09-04T23:59:00.000Z');
		expect(parse('call monday').dueDate).toBe('2026-08-31T23:59:00.000Z');
	});

	it('month arithmetic clamps to the target month length', () => {
		const jan31 = new Date('2026-01-31T10:00:00.000Z');
		const result = parseTaskQuickAdd('renew in a month', { now: jan31, zone: ZONE });
		expect(result.dueDate).toBe('2026-02-28T23:59:00.000Z');
	});
});

describe('strip order and title rebuild', () => {
	it('priority → cadence → date → scoping → assignee → tags → whitespace', () => {
		const result = parse('high priority every week water plants tomorrow #home for Sam', ROSTER);
		expect(result.title).toBe('water plants');
		expect(result.priority).toBe('high');
		expect(result.recurrenceFrequency).toBe('weekly');
		expect(result.dueDate).toBe('2026-08-29T23:59:00.000Z');
		expect(result.tags).toEqual(['home']);
		expect(result.assignedTo).toBe('u-sam');
	});

	it('an emptied title falls back to the raw input', () => {
		expect(parse('tomorrow').title).toBe('tomorrow');
	});

	it('priorityStated tells the phrase from the default', () => {
		expect(parse('buy milk').priorityStated).toBe(false);
		expect(parse('asap buy milk').priorityStated).toBe(true);
		expect(parse('not urgent buy milk').priority).toBe('low');
		expect(parse('high-priority buy milk').priority).toBe('high');
	});

	it('a Canvas clock time is stripped only when a date matched', () => {
		expect(parse('essay due sept 5 at 11:59 pm').title).toBe('essay');
		expect(parse('read at 11:59 pm').title).toBe('read at 11:59 pm');
	});
});

describe('recurrence', () => {
	it('a weekday anchor carries the next occurrence as the due date', () => {
		const result = parse('laundry every saturday');
		expect(result.recurrenceFrequency).toBe('weekly');
		expect(result.recurrenceInterval).toBe(1);
		expect(result.dueDate).toBe('2026-08-29T23:59:00.000Z');
		expect(result.title).toBe('laundry');
	});

	it('"every other saturday" is weekly × 2', () => {
		const result = parse('laundry every other saturday');
		expect(result.recurrenceFrequency).toBe('weekly');
		expect(result.recurrenceInterval).toBe(2);
	});

	it('the shared cadence table answers quarterly', () => {
		const result = parse('pay hoa quarterly');
		expect(result.recurrenceFrequency).toBe('monthly');
		expect(result.recurrenceInterval).toBe(3);
	});

	it('a bare duration is not a cadence ("once a month" stays text)', () => {
		expect(parse('call once a month').recurrenceFrequency).toBeNull();
	});
});

describe('scoping: #public/#private, @family, @name', () => {
	it('#public/#private is last-wins and sets visibilityExplicit', () => {
		const result = parse('#public #private buy milk');
		expect(result.visibility).toBe('private');
		expect(result.visibilityExplicit).toBe(true);
		expect(result.title).toBe('buy milk');
	});

	it('a longer tag like #privates stays an ordinary tag', () => {
		const result = parse('buy milk #privates');
		expect(result.tags).toEqual(['privates']);
		expect(result.visibilityExplicit).toBe(false);
	});

	it('@family sets familyTask and is stripped', () => {
		const result = parse('@family clean the garage', ROSTER);
		expect(result.familyTask).toBe(true);
		expect(result.title).toBe('clean the garage');
	});

	it('@name resolves the greedy longest match', () => {
		expect(parse('@sam buy milk', ROSTER).assignedTo).toBe('u-sam');
		expect(parse('@Sam Rivera buy milk', ROSTER).assignedTo).toBe('u-sam');
		expect(parse('@dad chen buy milk', ROSTER).assignedTo).toBe('u-dad');
	});

	it('an unknown @handle becomes unknownMember and is still cut', () => {
		const result = parse('@zoe buy milk', ROSTER);
		expect(result.unknownMember).toBe('@zoe');
		expect(result.assignedTo).toBeNull();
		expect(result.title).toBe('buy milk');
	});

	it('an ambiguous handle yields unknownMember with userId null', () => {
		const ambiguous: TaskQuickAddMember[] = [
			{ userId: 'u1', firstName: 'Sam', lastName: 'A' },
			{ userId: 'u2', firstName: 'Sam', lastName: 'B' }
		];
		const result = parse('@sam buy milk', ambiguous);
		expect(result.unknownMember).toBe('@sam');
		expect(result.assignedTo).toBeNull();
	});

	it('without an @ token the earliest trigger wins', () => {
		expect(parse('buy milk for Sam', ROSTER).assignedTo).toBe('u-sam');
		expect(parse('assign to Sam buy milk', ROSTER).title).toBe('buy milk');
		expect(parse('task Sam buy milk', ROSTER).assignedTo).toBe('u-sam');
	});

	it('without a roster nothing is stripped or assigned', () => {
		const result = parse('buy milk for Sam');
		expect(result.assignedTo).toBeNull();
		expect(result.title).toBe('buy milk for Sam');
	});
});

describe('tags and summary', () => {
	it('tags are lowercased, de-duplicated and sorted', () => {
		expect(parse('#Zebra buy #apple #zebra milk').tags).toEqual(['apple', 'zebra']);
	});

	it('hasInfo/summaryLabel describe what was read', () => {
		const plain = parse('buy milk');
		expect(plain.hasInfo).toBe(false);
		expect(plain.summaryLabel).toBeNull();

		const rich = parse('buy milk tomorrow high priority #home', ROSTER);
		expect(rich.hasInfo).toBe(true);
		expect(rich.summaryLabel).toContain('due Aug 29');
		expect(rich.summaryLabel).toContain('high priority');
		expect(rich.summaryLabel).toContain('#home');
	});
});

describe('findTaskAssignee — roster-scoped matching', () => {
	it('returns the earliest occurrence and the longest phrase at one spot', () => {
		expect(findTaskAssignee('buy milk for Sam', ROSTER)).toEqual({
			userId: 'u-sam',
			index: 8,
			length: 8
		});
		expect(findTaskAssignee('buy milk for Sam Rivera', ROSTER)?.length).toBe(15);
	});

	it('is roster-scoped and word-bounded', () => {
		expect(findTaskAssignee('buy milk for Sammy', ROSTER)).toBeNull();
		expect(findTaskAssignee('buy milk', ROSTER)).toBeNull();
	});
});
