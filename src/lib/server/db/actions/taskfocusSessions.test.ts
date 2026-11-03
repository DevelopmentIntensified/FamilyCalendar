import { describe, it, expect, vi } from 'vitest';

/**
 * phoneFocusMinutes / phoneFocusStartedAt aggregation (#293): only the
 * caller's closed + unabsorbed sessions count, summed then floored to whole
 * minutes; an open session sets phoneFocusStartedAt.
 */
// oxlint-disable-next-line anti-slop/no-module-mocking -- no Postgres; the in-memory store stands in for the drizzle one.
vi.mock('$lib/server/db', () => ({ db: {} }));

import type { TaskfocusSession } from '$lib/server/db/schema';
import { sessionTimesError, summarizePhoneFocus, withPhoneFocus } from './taskfocusSessions';
import { memoryStore } from './taskfocusSessions.memoryStore';

const T0 = new Date('2026-11-03T10:00:00Z').getTime();
const at = (sec: number) => new Date(T0 + sec * 1000);

function row(over: Partial<TaskfocusSession> & Pick<TaskfocusSession, 'taskId'>): TaskfocusSession {
	return {
		id: Math.random().toString(36).slice(2),
		userId: 'me',
		startedAt: at(0),
		endedAt: at(60),
		source: 'phone',
		absorbedAt: null,
		createdAt: at(0),
		...over
	};
}

describe('summarizePhoneFocus', () => {
	it('floors the SUMMED duration (two 90 s sessions = 3 min, not 2)', () => {
		const m = summarizePhoneFocus([
			row({ taskId: 't1', startedAt: at(0), endedAt: at(90) }),
			row({ taskId: 't1', startedAt: at(200), endedAt: at(290) })
		]);
		expect(m.get('t1')).toEqual({ phoneFocusMinutes: 3, phoneFocusStartedAt: null });
	});

	it('rounds down (59 s = 0, 119 s = 1)', () => {
		expect(
			summarizePhoneFocus([row({ taskId: 'a', endedAt: at(59) })]).get('a')?.phoneFocusMinutes
		).toBe(0);
		expect(
			summarizePhoneFocus([row({ taskId: 'b', endedAt: at(119) })]).get('b')?.phoneFocusMinutes
		).toBe(1);
	});

	it('ignores absorbed sessions', () => {
		const m = summarizePhoneFocus([row({ taskId: 't1', endedAt: at(600), absorbedAt: at(700) })]);
		expect(m.get('t1')).toBeUndefined();
	});

	it('an open session contributes no minutes but sets phoneFocusStartedAt', () => {
		const m = summarizePhoneFocus([
			row({ taskId: 't1', startedAt: at(0), endedAt: at(300) }),
			row({ taskId: 't1', startedAt: at(400), endedAt: null })
		]);
		expect(m.get('t1')).toEqual({ phoneFocusMinutes: 5, phoneFocusStartedAt: at(400) });
	});

	it('keeps tasks separate', () => {
		const m = summarizePhoneFocus([
			row({ taskId: 't1', endedAt: at(120) }),
			row({ taskId: 't2', endedAt: at(240) })
		]);
		expect(m.get('t1')?.phoneFocusMinutes).toBe(2);
		expect(m.get('t2')?.phoneFocusMinutes).toBe(4);
	});
});

describe('withPhoneFocus', () => {
	it("counts only the caller's sessions; untouched tasks get 0 / null; desktop fields unchanged", async () => {
		const store = memoryStore();
		store.rows.push(
			row({ taskId: 't1', userId: 'me', endedAt: at(180) }),
			row({ taskId: 't1', userId: 'other', endedAt: at(3600) }),
			row({ taskId: 't2', userId: 'other', endedAt: null })
		);
		const tasks = [
			{ id: 't1', focusMinutes: 7, focusStartedAt: null },
			{ id: 't2', focusMinutes: null, focusStartedAt: at(10) }
		];
		const out = await withPhoneFocus('me', tasks, store);
		expect(out).toEqual([
			{
				id: 't1',
				focusMinutes: 7,
				focusStartedAt: null,
				phoneFocusMinutes: 3,
				phoneFocusStartedAt: null
			},
			{
				id: 't2',
				focusMinutes: null,
				focusStartedAt: at(10),
				phoneFocusMinutes: 0,
				phoneFocusStartedAt: null
			}
		]);
	});

	it('skips the query for an empty list', async () => {
		const store = memoryStore();
		const spy = vi.spyOn(store, 'listUnabsorbed');
		expect(await withPhoneFocus('me', [], store)).toEqual([]);
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('sessionTimesError', () => {
	const now = at(0);
	it('accepts a start up to 5 min ahead', () => {
		expect(sessionTimesError(at(300), null, now)).toBeNull();
		expect(sessionTimesError(at(301), null, now)).toMatch(/future/);
	});
	it('rejects endedAt <= startedAt and spans > 12 h', () => {
		expect(sessionTimesError(at(0), at(0), now)).toMatch(/after/);
		expect(sessionTimesError(at(-43201), at(0), now)).toMatch(/12 hours/);
		expect(sessionTimesError(at(-43200), at(0), now)).toBeNull();
	});
});
