/**
 * familyHub services and page handlers against real Postgres: one test per IO
 * Invariant, titled after the rule. Each DB case runs in `rollbackTest`;
 * `testCtx({ db, now })` supplies the clock and the memory ports, so no test
 * touches legacy code or another module's fixtures (R9).
 *
 * Expected values come from the legacy services
 * (`src/lib/server/services/familyData.ts`, `src/lib/server/db/actions/
 * familyActivity.ts`, `src/lib/server/db/actions/taskCategories.ts`) and the
 * frozen golden `familyHub.http.db.test.ts`.
 *
 * Doc: ./README.md#how-to-test
 */
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import {
	families,
	familyInviteCodes,
	familyMembers,
	taskCategories,
	tasks,
	userSettings,
	type UserRow
} from '$lib/kernel/db/tables.server';
import {
	invokeAction,
	invokeLoad,
	isActionFailure
} from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import type { IdentityPorts } from '$lib/domains/identity/index.server';
import {
	familyBoardPageLoad,
	familyHubActions,
	familyHubPageLoad,
	legacyFamilyBoardPathLoad
} from './familyHub.http.server';
import { getFamilyBoard, getFamilyHub } from './familyHub.service.server';
import type { FamilyHubCtx } from './index.server';

const NOW = '2026-03-01T09:00:00.000Z';

/** `family`'s five ports, as memory fakes: the switches are the only ones this screen reads. */
function hubCtx(db: Db, switches: Record<string, boolean> = {}): FamilyHubCtx & TestCtx {
	const identityPorts: IdentityPorts = {
		calendarAccess: { listAccessibleCalendarIds: async () => [] },
		adConsent: { listConsentHistory: async () => [], recordConsentChange: async () => undefined }
	};
	return {
		...testCtx({ db, now: NOW }),
		calendar: { createFamilyCalendar: async () => undefined },
		tasks: { unassignMemberTasks: async () => undefined },
		moduleSwitches: { listFamilyModuleSwitches: async () => switches },
		childAccount: {
			createChildAccount: async () => {
				throw new Error('the child port is not part of this screen');
			}
		},
		inviteLink: {
			mintInviteLink: async () => {
				throw new Error('the invite-link port is not part of this screen');
			}
		},
		...identityPorts
	};
}

type World = {
	ann: UserRow;
	bob: UserRow;
	stranger: UserRow;
};

/**
 * Two families, oldest first: Ann creates `fam-old` (with Bob) and belongs to
 * `fam-new`; the stranger belongs to neither. Same ordering the golden uses, so
 * "the oldest" is unambiguous.
 */
async function seedWorld(db: Db): Promise<World> {
	const ann = await seedUser(db, { firstName: 'Ann', lastName: 'Lee' });
	const bob = await seedUser(db, { firstName: 'Bob', lastName: 'Roy' });
	const stranger = await seedUser(db, { firstName: 'Sam', lastName: 'Outsider' });
	await db.insert(families).values([
		{ id: 'fam-old', name: 'Old Home', color: '#c45e38', createdAt: new Date('2025-01-01T00:00:00Z') },
		{ id: 'fam-new', name: 'New Home', color: null, createdAt: new Date('2026-01-01T00:00:00Z') }
	]);
	await db.insert(familyMembers).values([
		{ userId: ann.id, familyId: 'fam-old', role: 'creator', memberType: 'parent' },
		{ userId: bob.id, familyId: 'fam-old', role: 'member', memberType: 'child' },
		{ userId: ann.id, familyId: 'fam-new', role: 'member', memberType: 'parent' }
	]);
	return { ann, bob, stranger };
}

type Caught = { status: number; location?: string; body?: { message?: string } };

/** What a load threw: a redirect's status/location, or an HttpError's status and message. */
async function thrownBy(promise: Promise<unknown>): Promise<Caught> {
	try {
		await promise;
		throw new Error('expected the handler to throw');
	} catch (cause) {
		if (isRedirect(cause)) return { status: cause.status, location: cause.location };
		if (isHttpError(cause)) return { status: cause.status, body: cause.body as Caught['body'] };
		throw cause;
	}
}

/**
 * The db with only the category read broken: a `select` whose `from` names
 * `taskCategories` throws, every other query passes through. The legacy read
 * caught its own failure and answered `[]`; this drives that seam.
 */
function dbWithoutCategories(db: Db): Db {
	return new Proxy(db, {
		get(target, prop, receiver) {
			if (prop !== 'select') return Reflect.get(target, prop, receiver);
			return (...args: unknown[]) => {
				const select = Reflect.get(target, 'select') as (...input: unknown[]) => object;
				const query = select.apply(target, args);
				return new Proxy(query, {
					get(builder, key) {
						if (key === 'from') {
							return (table: unknown) => {
								if (table === taskCategories) throw new Error('task_categories read failed');
								const from = Reflect.get(builder, 'from') as (value: unknown) => unknown;
								return from.call(builder, table);
							};
						}
						const value = Reflect.get(builder, key);
						return typeof value === 'function' ? value.bind(builder) : value;
					}
				});
			};
		}
	});
}

describe('getFamilyHub', () => {
	rollbackTest('a non-member and a missing family get the same notFound', async (db) => {
		const { stranger } = await seedWorld(db);
		const nonMember = await getFamilyHub(hubCtx(db), actorFromUser(stranger, 'session'), {
			familyId: 'fam-old'
		}).catch((error: unknown) => error);
		const missing = await getFamilyHub(hubCtx(db), actorFromUser(stranger, 'session'), {
			familyId: 'fam-missing'
		}).catch((error: unknown) => error);
		expect(nonMember).toMatchObject({ status: 404, message: 'Family not found' });
		expect(missing).toMatchObject({ status: 404, message: 'Family not found' });
	});

	rollbackTest('composes the detail model from the domains', async (db) => {
		const { ann, bob } = await seedWorld(db);
		await db.insert(familyInviteCodes).values({
			code: 'LIVE000001',
			familyId: 'fam-old',
			expiresAt: new Date('2026-04-01T00:00:00Z'),
			maxUses: 5,
			useCount: 2,
			createdBy: ann.id
		});
		await db.insert(userSettings).values({ userId: ann.id, hiddenDashboardModules: ['verse'] });

		const model = await getFamilyHub(
			hubCtx(db, { board: false, kids: true, groceries: true, meals: true }),
			actorFromUser(ann, 'session'),
			{ familyId: 'fam-old' }
		);

		expect(model.family).toMatchObject({ id: 'fam-old', name: 'Old Home', color: '#c45e38' });
		expect(model.members.map((member) => [member.userId, member.role, member.memberType])).toEqual(
			[
				[ann.id, 'creator', 'parent'],
				[bob.id, 'member', 'child']
			]
		);
		expect(model.currentUserRole).toBe('creator');
		expect(model.currentUserId).toBe(ann.id);
		expect(model.moduleSwitches).toEqual({ board: false, kids: true, groceries: true, meals: true });
		expect(model.hiddenDashboardModules).toEqual(['verse']);
		expect(model.activeInvite).toMatchObject({ code: 'LIVE000001', useCount: 2, maxUses: 5 });
		// "Created by Ann" is the minting member's first name, resolved against the roster.
		expect(model.inviteCreatedBy).toBe('Ann');
		expect(model.planUsage).toMatchObject({ members: 2, memberLimit: 6, familyLimit: 1 });
	});

	rollbackTest('recent activity is two reads merged newest-first and cut to eight', async (db) => {
		const { ann, bob } = await seedWorld(db);
		// Nine completions and nine accepted handoffs: each leg is read newest
		// first and limited, then the merged list is re-sorted and cut to eight.
		await db.insert(tasks).values(
			Array.from({ length: 9 }, (_, index) => ({
				id: `done-${index}`,
				title: `Done ${index}`,
				userId: ann.id,
				familyId: 'fam-old',
				assignedTo: bob.id,
				assignmentStatus: 'accepted',
				completedAt: `2026-02-${String(index + 10).padStart(2, '0')} 10:00:00+00`,
				createdAt: new Date(`2026-01-${String(index + 10).padStart(2, '0')}T00:00:00Z`)
			}))
		);
		await db.insert(tasks).values(
			Array.from({ length: 9 }, (_, index) => ({
				id: `hand-${index}`,
				title: `Hand ${index}`,
				userId: ann.id,
				familyId: 'fam-old',
				assignedTo: bob.id,
				assignmentStatus: 'accepted',
				createdAt: new Date(`2026-02-${String(index + 10).padStart(2, '0')}T12:00:00Z`)
			}))
		);

		const model = await getFamilyHub(hubCtx(db), actorFromUser(ann, 'session'), {
			familyId: 'fam-old'
		});

		expect(model.activity).toHaveLength(8);
		const instants = model.activity.map((item) => item.at);
		expect(instants).toEqual([...instants].sort().reverse());
		// A completion names the assignee (else the creator); a handoff names the
		// creator as actor and the assignee as target.
		const completion = model.activity.find((item) => item.kind === 'completed');
		expect(completion).toMatchObject({ actorName: 'Bob Roy', targetName: null });
		const handoff = model.activity.find((item) => item.kind === 'assigned');
		expect(handoff).toMatchObject({ actorName: 'Ann Lee', targetName: 'Bob Roy' });
	});
});

describe('getFamilyBoard', () => {
	rollbackTest('falls back to the oldest when the named family is not the user’s', async (db) => {
		const { bob } = await seedWorld(db);
		const named = await getFamilyBoard(hubCtx(db), actorFromUser(bob, 'session'), {
			requested: 'fam-new'
		});
		expect(named?.familyId).toBe('fam-old');
		const oldest = await getFamilyBoard(hubCtx(db), actorFromUser(bob, 'session'), {
			requested: null
		});
		expect(oldest?.familyId).toBe('fam-old');
	});

	rollbackTest('answers null when the viewer belongs to no family', async (db) => {
		const { stranger } = await seedWorld(db);
		expect(
			await getFamilyBoard(hubCtx(db), actorFromUser(stranger, 'session'), { requested: 'fam-old' })
		).toBeNull();
	});

	rollbackTest('carries both task scopes, the six-key roster and the viewer’s own categories', async (db) => {
		const { ann, bob } = await seedWorld(db);
		await db.insert(tasks).values([
			{
				id: 'task-family',
				title: 'Mow the lawn',
				userId: ann.id,
				familyId: 'fam-old',
				assignedTo: bob.id,
				assignmentStatus: 'accepted',
				createdAt: new Date('2026-01-02T00:00:00Z')
			},
			{
				id: 'task-public',
				title: 'Piano practice',
				userId: bob.id,
				familyId: null,
				visibility: 'public',
				createdAt: new Date('2026-01-03T00:00:00Z')
			},
			{
				id: 'task-private',
				title: 'Diary',
				userId: bob.id,
				familyId: null,
				visibility: 'private',
				createdAt: new Date('2026-01-04T00:00:00Z')
			}
		]);
		await db.insert(taskCategories).values([
			{ id: 'cat-errand', userId: ann.id, name: 'Errands' },
			{ id: 'cat-home', userId: ann.id, name: 'Home' },
			{ id: 'cat-music', userId: bob.id, name: 'Music' }
		]);

		const board = await getFamilyBoard(hubCtx(db), actorFromUser(ann, 'session'), {
			requested: 'fam-old'
		});

		expect(board?.tasks.map((task) => task.id)).toEqual(['task-family']);
		// Another member's private personal Task never reaches the Public tab.
		expect(board?.publicTasks.map((task) => task.id)).toEqual(['task-public']);
		expect(board?.familyRoster.map((member) => Object.keys(member).sort())).toEqual([
			['email', 'firstName', 'lastName', 'memberType', 'role', 'userId'],
			['email', 'firstName', 'lastName', 'memberType', 'role', 'userId']
		]);
		// Only the viewer's own list, name-sorted, and only `{id, name}`.
		expect(board?.taskCategories).toEqual([
			{ id: 'cat-errand', name: 'Errands' },
			{ id: 'cat-home', name: 'Home' }
		]);
	});

	rollbackTest('a failed category read yields no suggestions', async (db) => {
		const { ann } = await seedWorld(db);
		const ctx = hubCtx(dbWithoutCategories(db));
		const board = await getFamilyBoard(ctx, actorFromUser(ann, 'session'), {
			requested: 'fam-old'
		});
		expect(board?.taskCategories).toEqual([]);
		expect(ctx.log.entries).toContainEqual(
			expect.objectContaining({ event: 'family_hub.task_categories_read_failed' })
		);
	});

	rollbackTest('windows the completed rows and keeps their true count (Q-091)', async (db) => {
		const { ann } = await seedWorld(db);
		await db.insert(tasks).values([
			{
				id: 'open-task',
				title: 'Open',
				userId: ann.id,
				familyId: 'fam-old',
				createdAt: new Date('2026-02-01T00:00:00Z')
			},
			{
				id: 'done-a',
				title: 'Done A',
				userId: ann.id,
				familyId: 'fam-old',
				completedAt: '2026-01-05 10:00:00+00',
				createdAt: new Date('2026-01-03T00:00:00Z')
			},
			{
				id: 'done-b',
				title: 'Done B',
				userId: ann.id,
				familyId: 'fam-old',
				completedAt: '2026-01-04 10:00:00+00',
				createdAt: new Date('2026-01-02T00:00:00Z')
			},
			{
				id: 'done-c',
				title: 'Done C',
				userId: ann.id,
				familyId: 'fam-old',
				completedAt: '2026-01-03 10:00:00+00',
				createdAt: new Date('2026-01-01T00:00:00Z')
			}
		]);

		const windowed = await getFamilyBoard(hubCtx(db), actorFromUser(ann, 'session'), {
			requested: 'fam-old',
			completedLimit: 2
		});
		expect(windowed?.tasks.map((task) => task.id)).toEqual(['open-task', 'done-a', 'done-b']);
		expect(windowed?.completedTotal).toBe(3);

		// The `/api` twin passes no limit, so the wire keeps every completed row.
		const whole = await getFamilyBoard(hubCtx(db), actorFromUser(ann, 'session'), {
			requested: 'fam-old'
		});
		expect(whole?.tasks).toHaveLength(4);
		expect(whole?.completedTotal).toBe(3);
	});
});

describe('the page handlers', () => {
	rollbackTest('the old per-family path redirects to the approved board', async (db) => {
		const { ann } = await seedWorld(db);
		const signedOut = await thrownBy(
			invokeLoad(legacyFamilyBoardPathLoad, { ctx: hubCtx(db), actor: null })
		);
		expect(signedOut).toEqual({ status: 302, location: '/login' });
		const signedIn = await thrownBy(
			invokeLoad(legacyFamilyBoardPathLoad, { ctx: hubCtx(db), actor: actorFromUser(ann, 'session') })
		);
		expect(signedIn).toEqual({ status: 308, location: '/family/tasks' });
	});

	rollbackTest('answers the legacy 404 on the detail load, and 302 /family with no family', async (db) => {
		const { ann, stranger } = await seedWorld(db);
		await expect(
			invokeLoad(familyHubPageLoad, {
				ctx: hubCtx(db),
				actor: actorFromUser(stranger, 'session'),
				params: { familyId: 'fam-old' }
			})
		).rejects.toMatchObject({ status: 404 });

		const boardless = await thrownBy(
			invokeLoad(familyBoardPageLoad, {
				ctx: hubCtx(db),
				actor: actorFromUser(stranger, 'session'),
				path: '/family/tasks'
			})
		);
		expect(boardless).toEqual({ status: 302, location: '/family' });

		const board = await invokeLoad(familyBoardPageLoad, {
			ctx: hubCtx(db),
			actor: actorFromUser(ann, 'session'),
			path: '/family/tasks',
			query: { familyId: 'fam-new' }
		});
		expect(board.familyId).toBe('fam-new');
	});

	rollbackTest('unauthenticated POSTs write nothing', async (db) => {
		const { bob } = await seedWorld(db);
		const result = await invokeAction(familyHubActions.removeMember, {
			ctx: hubCtx(db),
			actor: null,
			params: { familyId: 'fam-old' },
			form: { userId: bob.id }
		});
		expect(isActionFailure(result)).toBe(true);
		if (!isActionFailure(result)) return;
		expect(result.status).toBe(401);
		expect(result.data).toEqual({ success: false, error: 'Not signed in' });
		const roster = await db.select().from(familyMembers);
		expect(roster.map((row) => row.userId)).toContain(bob.id);
	});

	rollbackTest('role and Member Type refusals keep the legacy messages', async (db) => {
		const { ann, bob } = await seedWorld(db);
		const ctx = hubCtx(db);

		const ownRole = await invokeAction(familyHubActions.updateRole, {
			ctx,
			actor: actorFromUser(bob, 'session'),
			params: { familyId: 'fam-old' },
			form: { userId: bob.id, role: 'admin' }
		});
		expect(isActionFailure(ownRole) && ownRole.data).toEqual({
			error: 'Cannot change your own role'
		});

		const creatorRole = await invokeAction(familyHubActions.updateRole, {
			ctx,
			actor: actorFromUser(bob, 'session'),
			params: { familyId: 'fam-old' },
			form: { userId: ann.id, role: 'member' }
		});
		expect(isActionFailure(creatorRole) && creatorRole.data).toEqual({
			error: "Cannot change the family creator's role"
		});

		// Member Type is admin-only: a plain member is refused with the shared copy.
		const memberType = await invokeAction(familyHubActions.setMemberType, {
			ctx,
			actor: actorFromUser(bob, 'session'),
			params: { familyId: 'fam-old' },
			form: { userId: bob.id, memberType: 'parent' }
		});
		expect(isActionFailure(memberType) && memberType.data).toEqual({
			error: 'You do not have permission to perform this action'
		});

		// An admin renaming a member through the same action succeeds.
		const renamed = await invokeAction(familyHubActions.updateRole, {
			ctx,
			actor: actorFromUser(ann, 'session'),
			params: { familyId: 'fam-old' },
			form: { userId: bob.id, role: 'admin' }
		});
		expect(renamed).toEqual({ success: true });
		expect((await db.select().from(familyMembers)).find((row) => row.userId === bob.id)?.role).toBe(
			'admin'
		);
	});
});
