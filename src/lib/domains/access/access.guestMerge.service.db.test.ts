/**
 * access guest merge against real Postgres: keeping moves Events and Tasks in
 * one transaction, ends the guest's sessions and deletes its row; skipping, a
 * same-person id and a non-guest id each change nothing.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect } from 'vitest';
import type { Actor } from '$lib/kernel/ctx/actor';
import { authSession, calendars, events, tasks, users } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { eq } from 'drizzle-orm';
import { mergeGuest } from './access.guestMerge.service.server';

const NOW = '2026-04-01T12:00:00.000Z';

function actorOf(id: string, email: string | null): Actor {
	return { id, email, isAdmin: false, via: 'session' };
}

function guestEmail(suffix: string): string {
	return `guest-${suffix}@anonymous.placeholder.invalid`;
}

describe('mergeGuest', () => {
	rollbackTest('moves events and tasks, ends the guest sessions, then deletes it', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const guest = await seedUser(db, { email: guestEmail('merge-1') });
		const target = await seedUser(db, { email: 'merge-target@example.test' });
		await db
			.insert(calendars)
			.values({ id: 'cal-guest-merge', ownerId: guest.id, familyId: null });
		await db.insert(events).values({
			id: 'evt-guest-merge',
			ownerId: guest.id,
			calendarId: 'cal-guest-merge',
			title: 'Swim',
			start: NOW
		});
		await db.insert(tasks).values({ id: 'task-guest-merge', title: 'Pack', userId: guest.id });
		await db.insert(authSession).values({
			id: 'session-guest-merge',
			token: 'token-guest-merge',
			userId: guest.id,
			expiresAt: new Date('2099-01-01T00:00:00.000Z')
		});

		expect(
			await mergeGuest(ctx, actorOf(target.id, target.email), {
				guestId: guest.id,
				keep: true
			})
		).toEqual({ events: 1, tasks: 1 });

		const [personal] = await db
			.select()
			.from(calendars)
			.where(eq(calendars.ownerId, target.id));
		expect(personal?.familyId).toBeNull();
		expect(await db.select().from(events).where(eq(events.ownerId, target.id))).toEqual([
			expect.objectContaining({ id: 'evt-guest-merge', calendarId: personal?.id })
		]);
		expect(await db.select().from(tasks).where(eq(tasks.userId, target.id))).toEqual([
			expect.objectContaining({ id: 'task-guest-merge' })
		]);
		expect(await db.select().from(authSession).where(eq(authSession.userId, guest.id))).toEqual([]);
		expect(await db.select().from(users).where(eq(users.id, guest.id))).toEqual([]);
	});

	rollbackTest('keep:false only forgets the stash: the guest and its rows stay', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const guest = await seedUser(db, { email: guestEmail('skip') });
		const target = await seedUser(db, { email: 'skip-target@example.test' });
		await db.insert(events).values({
			id: 'evt-skip',
			ownerId: guest.id,
			title: 'Kept',
			start: NOW
		});

		expect(
			await mergeGuest(ctx, actorOf(target.id, target.email), { guestId: guest.id, keep: false })
		).toEqual({ events: 0, tasks: 0 });

		expect(await db.select().from(events).where(eq(events.ownerId, guest.id))).toHaveLength(1);
		expect(await db.select().from(users).where(eq(users.id, guest.id))).toHaveLength(1);
	});

	rollbackTest('a non-guest id is a null no-op', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const other = await seedUser(db, { email: 'not-a-guest@example.test' });
		const target = await seedUser(db, { email: 'noop-target@example.test' });

		expect(
			await mergeGuest(ctx, actorOf(target.id, target.email), { guestId: other.id, keep: true })
		).toEqual({ events: 0, tasks: 0 });
		expect(await db.select().from(users).where(eq(users.id, other.id))).toHaveLength(1);
	});

	rollbackTest('the same person, or no stash at all, moves nothing', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const person = await seedUser(db, { email: guestEmail('same') });

		expect(
			await mergeGuest(ctx, actorOf(person.id, person.email), {
				guestId: person.id,
				keep: true
			})
		).toEqual({ events: 0, tasks: 0 });
		expect(
			await mergeGuest(ctx, actorOf(person.id, person.email), { guestId: null, keep: true })
		).toEqual({ events: 0, tasks: 0 });
		expect(await db.select().from(users).where(eq(users.id, person.id))).toHaveLength(1);
	});
});
