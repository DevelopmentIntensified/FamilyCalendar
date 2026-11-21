/**
 * tasks quick-add service against real Postgres: the roster and zone reads
 * parsing's grammar needs, and the legacy refusals. Each test runs in
 * `rollbackTest`; the grammar's own vectors live in
 * `parsing.task.rules.test.ts` and are not repeated here.
 *
 * Expected copy comes from legacy `client/taskSubmit.ts`, and the create body's
 * shape from `tasks.contract.ts`.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import type { FamilyRow } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { resolveTaskQuickAdd } from './tasks.quickadd.service.server';
import { addMember, seedTaskFamily, seedUserZone } from './tasks.fixtures.server';

const NOW = '2026-03-01T12:00:00.000Z';

/** A caller with an optional family roster. */
async function caller(db: Db, options: { family?: boolean; zone?: string } = {}) {
	const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
	let family: FamilyRow | null = null;
	let sam: { readonly id: string } | null = null;
	if (options.family) {
		family = await seedTaskFamily(db);
		await addMember(db, mia.id, family.id);
		sam = await seedUser(db, { firstName: 'Sam', lastName: 'Rivera' });
		await addMember(db, sam.id, family.id);
	}
	if (options.zone) await seedUserZone(db, mia.id, options.zone);
	return { mia, family, sam, actor: actorFromUser(mia, 'session') };
}

describe('resolveTaskQuickAdd', () => {
	rollbackTest('resolves tags, priority, cadence, assignee and the family-less default', async (db) => {
		const { sam, actor } = await caller(db, { family: true });

		const draft = await resolveTaskQuickAdd(testCtx({ db, now: NOW }), actor, {
			text: 'Pay rent #home high priority every 2 weeks for Sam Rivera'
		});

		expect(draft.title).toBe('Pay rent');
		expect(draft.body).toEqual({
			title: 'Pay rent',
			notes: null,
			// A cadence with no date still gets a cursor: end of day in the caller's zone.
			dueDate: '2026-03-01T23:59:00.000Z',
			eventId: null,
			// No @family marker: a personal Task, so familyId is sent as null.
			familyId: null,
			assignedTo: sam?.id,
			visibility: 'public',
			priority: 'high',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2,
			tags: ['home'],
			focusMinutes: null,
			focusStartedAt: null,
			category: null
		});
		// The caller's own family is not implied by the parser.
		expect(draft.body.familyId).toBeNull();
	});

	rollbackTest('@family names the caller`s family', async (db) => {
		const { family, actor } = await caller(db, { family: true });

		const draft = await resolveTaskQuickAdd(testCtx({ db, now: NOW }), actor, {
			text: '@family clean the garage'
		});

		expect(draft.title).toBe('clean the garage');
		expect(draft.body.familyId).toBe(family?.id);
	});

	rollbackTest('refuses @family without a family, with the legacy copy', async (db) => {
		const { actor } = await caller(db);

		await expect(
			resolveTaskQuickAdd(testCtx({ db, now: NOW }), actor, { text: '@family clean the garage' })
		).rejects.toMatchObject({
			status: 400,
			message: "@family needs a family — you're not in one yet."
		});
	});

	rollbackTest('refuses an unknown @member instead of dropping it', async (db) => {
		const { actor } = await caller(db, { family: true });

		await expect(
			resolveTaskQuickAdd(testCtx({ db, now: NOW }), actor, { text: '@zoe buy milk' })
		).rejects.toMatchObject({
			status: 400,
			message: 'Unknown member @zoe — check the spelling or pick someone from your family.'
		});
	});

	rollbackTest('an explicit #public/#private wins over the picker', async (db) => {
		const { actor } = await caller(db, { family: true });
		const ctxValue = testCtx({ db, now: NOW });

		const visible = await resolveTaskQuickAdd(ctxValue, actor, {
			text: '#public buy milk',
			visibilityFallback: 'private'
		});
		const hidden = await resolveTaskQuickAdd(ctxValue, actor, {
			text: '#private buy milk',
			visibilityFallback: 'public'
		});

		expect(visible.body.visibility).toBe('public');
		expect(hidden.body.visibility).toBe('private');
	});

	rollbackTest('falls back to the picker`s due date and refuses a value that is not one', async (db) => {
		const { actor } = await caller(db, { family: true });
		const ctxValue = testCtx({ db, now: NOW });

		const picked = await resolveTaskQuickAdd(ctxValue, actor, {
			text: 'buy milk',
			dueDateFallback: '2026-03-05'
		});
		expect(picked.body.dueDate).toBe('2026-03-05');

		// The parser's own date wins over the picker.
		const parsed = await resolveTaskQuickAdd(ctxValue, actor, {
			text: 'buy milk tomorrow',
			dueDateFallback: '2026-03-05'
		});
		expect(parsed.body.dueDate).toBe('2026-03-02T23:59:00.000Z');

		await expect(
			resolveTaskQuickAdd(ctxValue, actor, { text: 'buy milk', dueDateFallback: 'not-a-date' })
		).rejects.toMatchObject({ status: 400, message: 'Invalid dueDate' });
	});

	rollbackTest('drops a blank category and trims a real one', async (db) => {
		const { actor } = await caller(db, { family: true });
		const ctxValue = testCtx({ db, now: NOW });

		const blank = await resolveTaskQuickAdd(ctxValue, actor, { text: 'buy milk', category: '   ' });
		const named = await resolveTaskQuickAdd(ctxValue, actor, {
			text: 'buy milk',
			category: '  Errands  '
		});

		expect(blank.body.category).toBeNull();
		expect(named.body.category).toBe('Errands');
	});

	rollbackTest('lands due dates at 23:59 in the caller`s stored zone', async (db) => {
		const { actor } = await caller(db, { family: true, zone: 'Asia/Tokyo' });

		const draft = await resolveTaskQuickAdd(testCtx({ db, now: NOW }), actor, {
			text: 'water plants every 2 weeks'
		});

		// Tokyo's end of day is 14:59 UTC; the cross-day date keeps the zone honest.
		expect(draft.body.dueDate).toBe('2026-03-01T14:59:00.000Z');
		expect(draft.body.recurrenceFrequency).toBe('weekly');
		expect(draft.body.recurrenceInterval).toBe(2);
	});
});
