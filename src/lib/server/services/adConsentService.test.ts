import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Ad consent RECORDS (#088, owner answer).
 *
 * `userSettings.showAdsAsEvents` is the setting — one current value, and the
 * only thing that decides whether ads render. This is the RECORD: one row per
 * consent *event*, written when the setting changes and never on a read. It is
 * evidence, so "prove I consented" and "when did they withdraw" are both
 * answerable, and neither is answerable from the setting alone.
 */

/** Scripted drizzle stub (apiTokens.test.ts pattern): inserts are captured so
 *  "was a record written?" is answerable, not inferred. Typed from the schema so
 *  a column rename breaks this suite rather than silently passing. */
const state = vi.hoisted(() => ({
	inserts: [] as { userId: string; decision: AdConsentDecision }[],
	/** Rows the privacy-request read returns. */
	history: [] as { userId: string; decision: AdConsentDecision; recordedAt: Date }[]
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		insert: () => ({
			values: (values: { userId: string; decision: AdConsentDecision }) => {
				state.inserts.push(values);
				return { returning: () => Promise.resolve([]) };
			}
		}),
		select: () => ({
			from: () => ({
				where: () => {
					// The direction is taken from the ORDER BY the service actually
					// passed, not from the stub's own sorting, so dropping or flipping
					// the orderBy in the service breaks this test. drizzle encodes the
					// direction as a trailing chunk of [' desc'] / [' asc'].
					const isDescending = (order: unknown) => {
						const chunks = (order as { queryChunks?: { value?: string[] }[] })?.queryChunks;
						return (
							chunks?.some(
								(chunk) =>
									Array.isArray(chunk?.value) &&
									chunk.value.some((part) => part.trim().toLowerCase() === 'desc')
							) ?? false
						);
					};
					const sort = (order: unknown) => {
						const descending = isDescending(order);
						return Promise.resolve(
							[...state.history].sort((a, b) =>
								descending
									? b.recordedAt.getTime() - a.recordedAt.getTime()
									: a.recordedAt.getTime() - b.recordedAt.getTime()
							)
						);
					};
					return Object.assign(Promise.resolve([]), {
						orderBy: (order: unknown) => sort(order)
					});
				}
			})
		})
	}
}));

import {
	adConsentDecisionFor,
	recordAdConsentChange,
	getAdConsentRecords
} from './adConsentService';
import type { AdConsentDecision } from '$lib/server/db/schema';

beforeEach(() => {
	state.inserts = [];
	state.history = [];
});

/** Every decision written so far, in order. */
function decisionsWritten(): AdConsentDecision[] {
	return state.inserts.map((row) => row.decision);
}

describe('adConsentDecisionFor — when is there an event to record?', () => {
	it('records a grant the first time consent is given', () => {
		// Turning the box on is an event, from any prior state.
		expect(adConsentDecisionFor(undefined, true)).toBe('granted');
		expect(adConsentDecisionFor(null, true)).toBe('granted');
		expect(adConsentDecisionFor(false, true)).toBe('granted');
	});

	it('records a withdrawal the moment consent is taken back', () => {
		expect(adConsentDecisionFor(true, false)).toBe('withdrawn');
	});

	it('records nothing when the value does not change', () => {
		expect(adConsentDecisionFor(true, true)).toBeNull();
		expect(adConsentDecisionFor(false, false)).toBeNull();
	});

	it('records nothing for a user who has never touched the setting', () => {
		// The whole point: no event, so there is nothing to record. Saving the
		// settings form with the box untouched is not a refusal — the user was
		// never asked, and a "declined" row here would be a fabricated consent
		// record for a decision that was never made.
		expect(adConsentDecisionFor(undefined, false)).toBeNull();
		expect(adConsentDecisionFor(null, false)).toBeNull();
	});
});

describe('recordAdConsentChange — the writer', () => {
	it('writes one record on a transition', async () => {
		const written = await recordAdConsentChange('u1', undefined, true);

		expect(written).toBe('granted');
		expect(state.inserts).toHaveLength(1);
		expect(state.inserts[0].userId).toBe('u1');
		expect(state.inserts[0].decision).toBe('granted');
	});

	it('writes a withdrawal record too, so the evidence covers both directions', async () => {
		await recordAdConsentChange('u1', true, false);

		expect(decisionsWritten()).toEqual(['withdrawn']);
		expect(state.inserts[0].userId).toBe('u1');
	});

	it('appends rather than replacing, so history survives', async () => {
		await recordAdConsentChange('u1', false, true);
		await recordAdConsentChange('u1', true, false);
		await recordAdConsentChange('u1', false, true);

		expect(decisionsWritten()).toEqual(['granted', 'withdrawn', 'granted']);
	});

	it('writes nothing when the setting is saved unchanged', async () => {
		// Re-saving the settings form to change some other preference must not
		// manufacture a consent event.
		expect(await recordAdConsentChange('u1', true, true)).toBeNull();
		expect(await recordAdConsentChange('u1', false, false)).toBeNull();
		expect(state.inserts).toEqual([]);
	});

	it('writes nothing for a never-touched user who saves the form with ads off', async () => {
		expect(await recordAdConsentChange('u-new', undefined, false)).toBeNull();
		expect(state.inserts).toEqual([]);
	});
});

describe('getAdConsentRecords — the privacy-request read', () => {
	it('returns the whole trail, newest first', async () => {
		// This is what "when did they withdraw" is answered from: the head of
		// this list. Inserted oldest-first, so a reader that forgot to order
		// would hand back the wrong answer.
		state.history = [
			{ userId: 'u1', decision: 'granted', recordedAt: new Date('2026-01-01') },
			{ userId: 'u1', decision: 'withdrawn', recordedAt: new Date('2026-03-01') },
			{ userId: 'u1', decision: 'granted', recordedAt: new Date('2026-02-01') }
		];

		// Head of the list is the most recent event: the 03-01 withdrawal.
		const trail = await getAdConsentRecords('u1');
		expect(trail.map((r) => r.decision)).toEqual(['withdrawn', 'granted', 'granted']);
		expect(trail[0].recordedAt).toEqual(new Date('2026-03-01'));
	});

	it('is empty for a user who has never consented, rather than inventing one', async () => {
		expect(await getAdConsentRecords('u-new')).toEqual([]);
	});

	it('reads nothing into existence — a read never writes a record', async () => {
		state.history = [{ userId: 'u1', decision: 'granted', recordedAt: new Date('2026-01-01') }];

		await getAdConsentRecords('u1');
		await getAdConsentRecords('u1');

		expect(state.inserts).toEqual([]);
	});
});
