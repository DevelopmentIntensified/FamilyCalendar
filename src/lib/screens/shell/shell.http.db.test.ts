/**
 * shell's two layout loads at the HTTP boundary (no `/api` twin exists, so
 * this file replaces a golden): the one app-chrome guard, the root summary, and
 * the calendar group's shared scope — including that it carries a whitelisted
 * summary only, no `pathname`, and the countdown the frame renders.
 *
 * The parent layout's data is what the root load answers; `invokeLoad` hands it
 * over through `parentData`, so the group load runs the same `event.parent()`
 * path the browser's data request does.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { families, familyMembers, userSettings } from '$lib/kernel/db/tables.server';
import { invokeLoad } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import type { ShellRootModel, ShellUserSummary } from './shell.contract';
import { shellCalendarGroupLoad, shellRootLoad } from './shell.http.server';

const NOW = '2026-06-01T12:00:00.000Z';

/** The scope read takes the plain ctx: identity's stored-settings view reads no port. */
function scopeCtx(db: Db): TestCtx {
	return testCtx({ db, now: NOW });
}

/** A thrown Kit redirect, as `invokeLoad` surfaces it. */
async function redirectOf(
	run: () => Promise<unknown>
): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (cause) {
		if (typeof cause === 'object' && cause !== null && 'status' in cause && 'location' in cause) {
			const { status, location } = cause;
			if (typeof status === 'number' && typeof location === 'string') return { status, location };
		}
		throw cause;
	}
	throw new Error('expected a redirect');
}

/** The root layout's data, as `event.parent()` hands it to the group load. */
function rootParent(user: ShellUserSummary | null): Readonly<Record<string, JsonValue>> {
	const parent = { user, year: 2026 };
	// SAFETY: SvelteKit's devalue carries the Date across the layout boundary;
	// the test double's JsonValue type only models plain JSON.
	return parent as unknown as Readonly<Record<string, JsonValue>>;
}

/** The summary the root load answers for a seeded row, taken from the load itself. */
async function summaryOf(ctx: TestCtx, row: Awaited<ReturnType<typeof seedUser>>) {
	const model = await invokeLoad<ShellRootModel>(shellRootLoad, {
		ctx,
		path: '/(calendar)/calendar',
		user: row
	});
	const summary = model.user;
	if (!summary) throw new Error('expected a signed-in summary');
	return summary;
}

describe('shellRootLoad', () => {
	rollbackTest('redirects a guest to /login from an app-chrome route', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		for (const path of ['/(calendar)/calendar', '/(family)']) {
			expect(await redirectOf(() => invokeLoad(shellRootLoad, { ctx, path }))).toEqual({
				status: 302,
				location: '/login'
			});
		}
	});

	rollbackTest('answers no user and the server year for a public route', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		expect(await invokeLoad(shellRootLoad, { ctx, path: '/(marketing)' })).toEqual({
			user: null,
			year: 2026
		});
	});

	rollbackTest('answers the signed-in summary and the server year', async (db) => {
		const row = await seedUser(db, { firstName: 'Mia', roles: ['admin'] });
		const ctx = testCtx({ db, now: NOW });
		expect(await invokeLoad(shellRootLoad, { ctx, path: '/(calendar)/calendar', user: row })).toEqual(
			{
				user: {
					id: row.id,
					firstName: 'Mia',
					lastName: row.lastName,
					email: row.email,
					isAdmin: true,
					emailVerified: true,
					lastActiveAt: row.lastActiveAt
				},
				year: 2026
			}
		);
	});
});

describe('shellCalendarGroupLoad', () => {
	rollbackTest('passes the root summary through and adds settings, family, roster and countdown', async (db) => {
		// Thirty days idle, so the 90-day window has 60 left at NOW.
		const user = await seedUser(db, { lastActiveAt: new Date('2026-05-02T12:00:00.000Z') });
		await db.insert(userSettings).values({ userId: user.id, timeZone: 'America/Chicago' });
		const [family] = await db.insert(families).values({ name: 'Rivera Home' }).returning();
		await db.insert(familyMembers).values({ userId: user.id, familyId: family.id, role: 'creator' });
		const ctx = scopeCtx(db);
		const parent = await summaryOf(ctx, user);

		const data = await invokeLoad(shellCalendarGroupLoad, {
			ctx,
			path: '/(calendar)/calendar',
			user,
			parentData: rootParent(parent)
		});

		expect(Object.keys(data).sort()).toEqual([
			'daysLeft',
			'familyId',
			'familyMembers',
			'roster',
			'settings',
			'user',
			'userSettings',
			'year'
		]);
		expect(data.user).toEqual(parent);
		expect(data).toMatchObject({
			year: 2026,
			familyId: family.id,
			settings: { timeZone: 'America/Chicago' },
			daysLeft: 60
		});
		expect(data.roster).toHaveLength(1);
		// The two legacy names the unported calendar pages read (S8 sweep).
		expect(data.userSettings).toEqual(data.settings);
		expect(data.familyMembers).toEqual(data.roster);
	});

	rollbackTest('counts the Inactivity Window down from lastActiveAt', async (db) => {
		const user = await seedUser(db);
		const ctx = scopeCtx(db);
		const parent = await summaryOf(ctx, user);
		const stale = { ...parent, lastActiveAt: new Date('2026-05-25T12:00:00.000Z') };

		const data = await invokeLoad(shellCalendarGroupLoad, {
			ctx,
			path: '/(calendar)/calendar',
			user,
			parentData: rootParent(stale)
		});

		// Seven days idle: the 90-day window has 83 left (ceil).
		expect(data.daysLeft).toBe(83);
	});

	rollbackTest('redirects a guest even when a summary is somehow parented', async (db) => {
		const ctx = scopeCtx(db);
		const summary: ShellUserSummary = {
			id: 'u-1',
			firstName: 'Mia',
			lastName: 'Rivera',
			email: 'mia@example.test',
			isAdmin: false,
			emailVerified: true,
			lastActiveAt: null
		};
		expect(
			await redirectOf(() =>
				invokeLoad(shellCalendarGroupLoad, {
					ctx,
					path: '/(calendar)/calendar',
					parentData: rootParent(summary)
				})
			)
		).toEqual({ status: 302, location: '/login' });
	});
});
