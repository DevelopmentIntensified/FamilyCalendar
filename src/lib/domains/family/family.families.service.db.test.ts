/**
 * family families services against real Postgres: one test per IO Invariant,
 * titled after the rule. Each runs in `rollbackTest`; `testCtx({ db })` supplies
 * the clock, and the five ports the module declares are memory fakes, so a test
 * never touches legacy code and can assert the exact call (R9).
 *
 * Expected values come from the legacy services
 * (`src/lib/server/services/familyData.ts`, `db/actions/families.ts`) and the
 * frozen golden `family.http.db.test.ts`.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { families, familyMembers, tasks, userSettings } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import type { IdentityPorts } from '$lib/domains/identity/index.server';
import { seedFamily, seedFamilyRoster, seedInvite, seedMembership } from './family.fixtures.server';
import {
	createFamily,
	getFamily,
	listFamilies,
	updateFamily
} from './family.families.service.server';
import type { FamilyCtx, FamilyDetailCtx, FamilyPorts } from './index.server';

const NOW = '2026-03-01T09:00:00.000Z';

/** What the fakes recorded, so a test can prove the port was used and with what. */
type PortCalls = {
	readonly calendar: string[];
	readonly switches: string[];
};

function calls(): PortCalls {
	return { calendar: [], switches: [] };
}

/** Memory port adapters: no legacy write, and every call is observable. */
function familyPorts(recorded: PortCalls): FamilyPorts {
	return {
		calendar: {
			createFamilyCalendar: async (_ctx, familyId) => {
				recorded.calendar.push(familyId);
			}
		},
		tasks: {
			unassignMemberTasks: async () => undefined
		},
		moduleSwitches: {
			listFamilyModuleSwitches: async (_ctx, familyId) => {
				recorded.switches.push(familyId);
				return { board: false, kids: true, groceries: true, meals: true };
			}
		},
		childAccount: {
			createChildAccount: async () => {
				throw new Error('the child port is not part of these use-cases');
			}
		},
		inviteLink: {
			mintInviteLink: async () => {
				throw new Error('the invite-link port is not part of these use-cases');
			}
		}
	};
}

/** Identity's two ports, which `getFamily` reaches through its settings service. */
const identityPorts: IdentityPorts = {
	calendarAccess: { listAccessibleCalendarIds: async () => [] },
	adConsent: { listConsentHistory: async () => [], recordConsentChange: async () => undefined }
};

function familyCtx(db: Db, recorded: PortCalls = calls()): FamilyCtx {
	return { ...testCtx({ db, now: NOW }), ...familyPorts(recorded) };
}

function detailCtx(db: Db, recorded: PortCalls = calls()): FamilyDetailCtx {
	return { ...testCtx({ db, now: NOW }), ...familyPorts(recorded), ...identityPorts };
}

/** A db proxy that counts the repo calls a service makes, so "one read per page" is testable. */
function countingDb(db: Db): { db: Db; count: () => number } {
	let calls = 0;
	const counted: Record<string, true> = {
		select: true,
		insert: true,
		update: true,
		delete: true,
		execute: true
	};
	const proxy = new Proxy(db, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver);
			if (typeof value !== 'function') return value;
			if (!counted[String(property)]) return value.bind(target);
			return (...args: unknown[]) => {
				calls += 1;
				return (value as (...input: unknown[]) => unknown).apply(target, args);
			};
		}
	});
	return { db: proxy as Db, count: () => calls };
}

describe('listFamilies', () => {
	rollbackTest('orders families oldest first and builds each card from one read', async (db) => {
		const ann = await seedUser(db, { firstName: 'Ann', lastName: 'Rivera' });
		await seedFamily('fam-old', { name: 'Old House', createdAt: '2025-01-01T00:00:00.000Z' }, db);
		await seedFamily('fam-new', { name: 'New House', createdAt: '2026-01-01T00:00:00.000Z' }, db);
		await seedMembership('fam-old', ann.id, 'member', 'parent', db);
		await seedMembership('fam-new', ann.id, 'creator', 'parent', db);
		await db.insert(tasks).values({ title: 'Open', userId: ann.id, familyId: 'fam-old' });
		await db.insert(tasks).values({
			title: 'Done',
			userId: ann.id,
			familyId: 'fam-old',
			completedAt: '2026-02-01T00:00:00.000Z'
		});
		await seedInvite({ code: 'ACTIVE0001', familyId: 'fam-old' }, db);
		await seedInvite({ code: 'EXPIRED001', familyId: 'fam-old', expiresAt: '2000-01-01T00:00:00.000Z' }, db);

		const payload = await listFamilies(familyCtx(db), actorFromUser(ann, 'session'));

		expect(payload.families.map((card) => [card.id, card.role, card.canInvite])).toEqual([
			['fam-old', 'member', false],
			['fam-new', 'creator', true]
		]);
		expect(payload.families[0].memberCount).toBe(1);
		expect(payload.families[0].openTasks).toBe(1);
		expect(payload.families[0].members).toEqual([
			{ firstName: 'Ann', userId: ann.id }
		]);
		expect(payload.roster.map((row) => row.familyId).sort()).toEqual(['fam-new', 'fam-old']);
		// An expired code is not an invitation any more.
		expect(payload.activeInvites.map((invite) => invite.code)).toEqual(['ACTIVE0001']);
		expect(payload.plan).toEqual({ used: 2, limit: 1 });
	});

	rollbackTest('costs the same number of queries for 1 and 3 families', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-1', {}, db);
		await seedMembership('fam-1', ann.id, 'creator', 'member', db);

		const one = countingDb(db);
		await listFamilies(familyCtx(one.db), actorFromUser(ann, 'session'));

		await seedFamily('fam-2', {}, db);
		await seedFamily('fam-3', {}, db);
		await seedMembership('fam-2', ann.id, 'member', 'member', db);
		await seedMembership('fam-3', ann.id, 'member', 'member', db);

		const three = countingDb(db);
		const payload = await listFamilies(familyCtx(three.db), actorFromUser(ann, 'session'));

		expect(payload.families).toHaveLength(3);
		expect(three.count()).toBe(one.count());
	});
});

describe('getFamily', () => {
	rollbackTest('answers the member payload with the switches from the port and the hidden list from settings', async (db) => {
		const { ann } = await seedFamilyRoster(db);
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-1', useCount: 2, maxUses: 5, createdBy: ann.id }, db);
		await db
			.insert(userSettings)
			.values({ userId: ann.id, hiddenDashboardModules: ['verse'] });

		const recorded = calls();
		const detail = await getFamily(detailCtx(db, recorded), actorFromUser(ann, 'session'), 'fam-1');

		expect(recorded.switches).toEqual(['fam-1']);
		expect(detail.currentUserRole).toBe('creator');
		expect(detail.currentUserId).toBe(ann.id);
		expect(detail.members).toHaveLength(4);
		expect(detail.moduleSwitches).toEqual({ board: false, kids: true, groceries: true, meals: true });
		expect(detail.hiddenDashboardModules).toEqual(['verse']);
		expect(detail.activeInvite?.code).toBe('LIVE000001');
		expect(detail.activeInvite?.useCount).toBe(2);
		// "Created by Maya" is a first name resolved against the roster.
		expect(detail.inviteCreatedBy).toBe('Ann');
		expect(detail.planUsage.familyLimit).toBe(1);
		expect(detail.planUsage.memberLimit).toBe(6);
		expect(detail.planUsage.members).toBe(4);
		expect(detail.planUsage.aiLimit).toBe(10);
	});

	rollbackTest('answers one Family not found for a non-member and for a missing family', async (db) => {
		const { out } = await seedFamilyRoster(db);
		const notMember = await getFamily(detailCtx(db), actorFromUser(out, 'session'), 'fam-1').catch(
			(error: unknown) => error
		);
		expect(notMember).toMatchObject({ status: 404, message: 'Family not found' });

		const missing = await getFamily(detailCtx(db), actorFromUser(out, 'session'), 'nope').catch(
			(error: unknown) => error
		);
		expect(missing).toMatchObject({ status: 404, message: 'Family not found' });
	});
});

describe('createFamily', () => {
	rollbackTest('writes the family and its day-one roster, then the calendar through the port', async (db) => {
		const ann = await seedUser(db, { firstName: 'Ann' });
		const bob = await seedUser(db, { firstName: 'Bob' });
		const recorded = calls();

		const family = await createFamily(familyCtx(db, recorded), actorFromUser(ann, 'session'), {
			name: ' Riveras ',
			color: '',
			memberIds: [bob.id, ann.id, bob.id, '  ']
		});

		expect(family).toMatchObject({ name: 'Riveras', color: '#c45e38' });
		expect(recorded.calendar).toEqual([family.id]);
		const rows = await db.select().from(familyMembers).where(eq(familyMembers.familyId, family.id));
		expect(rows.map((row) => [row.userId, row.role, row.memberType]).sort()).toEqual(
			[
				[ann.id, 'creator', 'member'],
				[bob.id, 'member', 'member']
			].sort()
		);
	});

	rollbackTest('refuses at the family limit with upgradeRequired and writes nothing', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-1', {}, db);
		await seedMembership('fam-1', ann.id, 'creator', 'member', db);

		const failure = await createFamily(familyCtx(db), actorFromUser(ann, 'session'), {
			name: 'Second',
			color: ''
		}).catch((error: unknown) => error);

		expect(failure).toMatchObject({
			status: 403,
			message: 'Family limit reached (1). Upgrade to create more families.',
			extra: { upgradeRequired: true }
		});
		expect(await db.select().from(families)).toHaveLength(1);
	});

	rollbackTest('refuses an unverified pick and more picks than the plan allows', async (db) => {
		const ann = await seedUser(db);
		const unverified = await seedUser(db, { emailVerified: false });
		const unaddable = await createFamily(familyCtx(db), actorFromUser(ann, 'session'), {
			name: 'Riveras',
			color: '',
			memberIds: [unverified.id]
		}).catch((error: unknown) => error);
		expect(unaddable).toMatchObject({
			status: 400,
			message:
				'One of the people you picked cannot be added yet — send them an email invite instead.'
		});

		const picks: string[] = [];
		for (let index = 0; index < 6; index += 1) picks.push((await seedUser(db)).id);
		const tooMany = await createFamily(familyCtx(db), actorFromUser(ann, 'session'), {
			name: 'Riveras',
			color: '',
			memberIds: picks
		}).catch((error: unknown) => error);
		expect(tooMany).toMatchObject({
			status: 403,
			message:
				'Your plan allows 6 members in a family. Create the family first, then add the rest from the family page.'
		});
	});

	rollbackTest('refuses a blank name and a colour outside the palette', async (db) => {
		const ann = await seedUser(db);
		const blank = await createFamily(familyCtx(db), actorFromUser(ann, 'session'), {
			name: '   ',
			color: ''
		}).catch((error: unknown) => error);
		expect(blank).toMatchObject({ status: 400, message: 'Family name is required' });

		const colour = await createFamily(familyCtx(db), actorFromUser(ann, 'session'), {
			name: 'Riveras',
			color: '#000001'
		}).catch((error: unknown) => error);
		expect(colour).toMatchObject({ status: 400, message: 'Pick one of the offered family colours' });
	});
});

describe('updateFamily', () => {
	rollbackTest('renames for an admin, trimming the name and leaving the colour alone', async (db) => {
		const { bob } = await seedFamilyRoster(db);
		const family = await updateFamily(familyCtx(db), actorFromUser(bob, 'session'), 'fam-1', {
			name: ' Riveras ',
			color: undefined
		});
		expect([family.name, family.color]).toEqual(['Riveras', '#c45e38']);
	});

	rollbackTest('refuses a plain member with the permission copy and writes nothing', async (db) => {
		const { cid } = await seedFamilyRoster(db);
		const failure = await updateFamily(familyCtx(db), actorFromUser(cid, 'session'), 'fam-1', {
			name: 'Hijacked'
		}).catch((error: unknown) => error);
		expect(failure).toMatchObject({
			status: 403,
			message: 'You do not have permission to perform this action'
		});
		const [row] = await db.select().from(families).where(eq(families.id, 'fam-1'));
		expect(row.name).toBe('Riveras');
	});
});
