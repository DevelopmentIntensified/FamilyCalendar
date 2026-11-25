/**
 * shell's two services against real Postgres: the whitelisted session summary
 * (#324), and the calendar group's shared scope — identity's settings, family's
 * id and roster, with the family half degrading to `null`/`[]` exactly as the
 * legacy `loadUserScope` `try/catch` did (`src/lib/server/services/userScope.ts`
 * — a broken family read never 500s a page).
 *
 * Seeds identity's `userSettings`, family's `families`/`familyMembers` and the
 * roster's people directly: this screen owns no tables and no fixtures
 * (README How to test), and a db test may insert them (rule R3).
 *
 * Doc: ./README.md#how-to-test
 */
import { eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import {
	families,
	familyMembers,
	userSettings,
	users,
	type UserRow
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import {
	loadCalendarGroup,
	loadShellRoot,
	type ShellSessionViewer
} from './shell.service.server';

const NOW = '2026-06-01T12:00:00.000Z';

/** The scope read takes the plain ctx: identity's stored-settings view reads no port. */
function scopeCtx(db: Db): TestCtx {
	return testCtx({ db, now: NOW });
}

/** A family with `member` in it, plus a second person on its roster. */
async function seedFamily(db: Db, memberId: string): Promise<{ familyId: string; otherId: string }> {
	const [family] = await db.insert(families).values({ name: 'Rivera Home' }).returning();
	const other = await seedUser(db, { firstName: 'Ada', lastName: 'Rivera' });
	await db.insert(familyMembers).values([
		{ userId: memberId, familyId: family.id, role: 'creator', memberType: 'parent' },
		{ userId: other.id, familyId: family.id, role: 'member', memberType: 'child' }
	]);
	return { familyId: family.id, otherId: other.id };
}

/** The viewer fields the chrome reads, taken from a seeded row. */
function viewerOf(row: UserRow): ShellSessionViewer {
	return {
		id: row.id,
		firstName: row.firstName,
		lastName: row.lastName,
		email: row.email,
		emailVerified: row.emailVerified,
		lastActiveAt: row.lastActiveAt
	};
}

describe('loadShellRoot', () => {
	rollbackTest('returns a whitelisted user summary, never credentials', async (db) => {
		const seeded = await seedUser(db, { firstName: 'Mia', lastName: 'Rivera', roles: ['admin'] });
		// The credential columns the legacy layouts serialised (#324).
		const [row] = await db
			.update(users)
			.set({
				passwordHash: 'scrypt$deadbeef',
				phonenumber: '+15550001111',
				receiptIngestToken: 'ingest-token'
			})
			.where(eq(users.id, seeded.id))
			.returning();
		const ctx = testCtx({ db, now: NOW });

		const model = loadShellRoot(ctx, actorFromUser(row, 'session'), viewerOf(row));

		expect(model).toEqual({
			user: {
				id: row.id,
				firstName: 'Mia',
				lastName: 'Rivera',
				email: row.email,
				isAdmin: true,
				emailVerified: true,
				lastActiveAt: row.lastActiveAt
			},
			year: 2026
		});
		expect(Object.keys(model.user ?? {}).sort()).toEqual([
			'email',
			'emailVerified',
			'firstName',
			'id',
			'isAdmin',
			'lastActiveAt',
			'lastName'
		]);
	});

	rollbackTest('answers no user and the server year for a guest', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		expect(loadShellRoot(ctx, null, null)).toEqual({ user: null, year: 2026 });
	});
});

describe('loadCalendarGroup', () => {
	rollbackTest('reads settings, family and roster and degrades a failed family read to null/[]', async (db) => {
		const user = await seedUser(db);
		await db.insert(userSettings).values({
			userId: user.id,
			timeZone: 'America/Chicago',
			weekStart: 'monday',
			color: '#fa8072',
			defaultView: 'weekView',
			hiddenDashboardModules: ['board']
		});
		const { familyId, otherId } = await seedFamily(db, user.id);
		const actor = actorFromUser(user, 'session');

		const scope = await loadCalendarGroup(scopeCtx(db), actor);

		expect(scope.familyId).toBe(familyId);
		expect(scope.settings).toMatchObject({
			timeZone: 'America/Chicago',
			weekStart: 'monday',
			color: '#fa8072',
			defaultView: 'weekView',
			hiddenDashboardModules: ['board']
		});
		expect('verseTranslation' in (scope.settings ?? {})).toBe(false);
		expect(scope.roster.map((member) => [member.userId, member.role, member.memberType])).toEqual(
			expect.arrayContaining([
				[user.id, 'creator', 'parent'],
				[otherId, 'member', 'child']
			])
		);
	});

	rollbackTest('answers a null settings row and no family for a fresh account', async (db) => {
		const user = await seedUser(db);
		const scope = await loadCalendarGroup(scopeCtx(db), actorFromUser(user, 'session'));
		expect(scope).toEqual({ settings: null, familyId: null, roster: [] });
	});

	rollbackTest('degrades a broken family read to null/[] and logs it', async (db) => {
		const user = await seedUser(db);
		await seedFamily(db, user.id);
		// Make the roster read fail the way a golden does: the column its SELECT
		// reads is gone for this (rolled-back) transaction.
		await db.execute(sql.raw('ALTER TABLE "familyMembers" DROP COLUMN "memberType"'));
		const ctx = scopeCtx(db);

		const scope = await loadCalendarGroup(ctx, actorFromUser(user, 'session'));

		expect(scope.familyId).toBeNull();
		expect(scope.roster).toEqual([]);
		expect(ctx.log.entries).toEqual([
			expect.objectContaining({ event: 'shell_family_read_failed' })
		]);
	});
});
