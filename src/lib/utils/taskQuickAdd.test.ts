import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findTaskAssignee, parseTaskQuickAdd, type TaskQuickAddMember } from './taskQuickAdd';

/**
 * Quick-add NLP — phrase table per AGENTS.md. Aggressively low on tolerance:
 * every distinct phrasing, word order, case and combination we can think of.
 *
 * Issue 323 (Lane B): the table itself lives in shared/parse-vectors.json and
 * the Android port runs the same file (TaskQuickAddTest.kt), so the two
 * parsers cannot drift apart unnoticed. Only the keys present in a vector are
 * asserted; `due.days` counts calendar days after NOW, `due.date` is a local
 * calendar date.
 *
 * `now` is injected (Fri 2026-08-28, 10:00 local) so weekday math is
 * deterministic regardless of the CI machine's timezone. Due-date assertions
 * compare LOCAL calendar dates, not ISO strings, so they hold in any zone.
 */
const NOW = new Date('2026-08-28T10:00:00.000Z'); // a Friday

interface Due {
	days?: number;
	date?: string;
}

interface Vector {
	phrase: string;
	roster?: string;
	title?: string;
	priority?: 'low' | 'normal' | 'high';
	due?: Due | null;
	assignedTo?: string | null;
	unknownMember?: string | null;
	tags?: string[];
	recurrence?: { frequency: string | null; interval: number | null } | null;
	visibility?: 'public' | 'private';
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

const VECTORS: VectorsFile = JSON.parse(
	readFileSync(new URL('../../../shared/parse-vectors.json', import.meta.url), 'utf8')
);

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

	const result = parseTaskQuickAdd(
		vector.phrase,
		roster ? { now: NOW, members: roster } : { now: NOW }
	);
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
