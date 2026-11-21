/**
 * The five family page handlers through the kernel's `invokeLoad` /
 * `invokeAction`: the two redirects, the list payload, the create page's plan
 * numbers, the create submit (redirect plus written rows, and the echoed
 * refusal), the invitations family choice, the add-member gate and the join
 * card's in-place "unusable" answer.
 *
 * Not goldens: page data is internal and was redesigned in S7. The `/api`
 * wire stays pinned by `family.http.db.test.ts`.
 *
 * Doc: ./README.md#how-to-test
 */
import { isRedirect, type ActionFailure } from '@sveltejs/kit';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { families, familyMembers } from '$lib/kernel/db/tables.server';
import type { ActionFail } from '$lib/kernel/http/pageHandlers.server';
import {
	invokeAction,
	invokeLoad,
	isActionFailure
} from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import type { Db } from '$lib/kernel/db/database.server';
import { seedFamily, seedInvite, seedMembership } from './family.fixtures.server';
import type { FamilyCtx, FamilyPorts } from './index.server';
import {
	familyAddMemberPageLoad,
	familyCreateAction,
	familyCreatePageLoad,
	familyHomePageLoad,
	familyInvitationsPageLoad,
	familyJoinPageLoad
} from './family.http.server';

const NOW = '2026-03-01T09:00:00.000Z';

/**
 * The page handlers never need another module's rows, so the five ports are
 * memory fakes: no legacy bridge writes outside `rollbackTest`'s transaction
 * (the golden ctx's real calendar adapter uses the `db` singleton).
 */
function familyPorts(): FamilyPorts {
	return {
		calendar: { createFamilyCalendar: async () => undefined },
		tasks: { unassignMemberTasks: async () => undefined },
		moduleSwitches: {
			listFamilyModuleSwitches: async () => ({ board: false, kids: true, groceries: true, meals: true })
		},
		childAccount: {
			createChildAccount: async () => {
				throw new Error('the child port is not part of the page handlers');
			}
		},
		inviteLink: {
			mintInviteLink: async () => {
				throw new Error('the invite-link port is not part of the page handlers');
			}
		}
	};
}

function familyCtx(db: Db): FamilyCtx {
	return { ...testCtx({ db, now: NOW }), ...familyPorts() };
}

type Redirected = { status: number; location: string };

async function redirectOf(promise: Promise<unknown>): Promise<Redirected | null> {
	try {
		await promise;
		return null;
	} catch (cause) {
		if (isRedirect(cause)) return { status: cause.status, location: cause.location };
		throw cause;
	}
}

const refusalOf = <F,>(value: unknown): ActionFailure<F> => {
	if (!isActionFailure<F, unknown>(value)) throw new Error('expected an action failure');
	return value;
};

describe('/family load', () => {
	rollbackTest('redirects an anonymous visitor 302 to /login', async (db) => {
		const ctx = familyCtx(db);
		expect(await redirectOf(invokeLoad(familyHomePageLoad, { ctx, path: '/family' }))).toEqual({
			status: 302,
			location: '/login'
		});
	});

	rollbackTest('answers every family with its roster, live code and plan', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-1', { name: 'Rivera Home' }, db);
		await seedMembership('fam-1', ann.id, 'creator', 'parent', db);
		await seedInvite({ code: 'HOP-1', familyId: 'fam-1' }, db);
		const ctx = familyCtx(db);
		const data = await invokeLoad(familyHomePageLoad, {
			ctx,
			actor: actorFromUser(ann, 'session'),
			path: '/family'
		});
		expect(data.families.map((family) => [family.id, family.name, family.canInvite])).toEqual([
			['fam-1', 'Rivera Home', true]
		]);
		expect(data.roster.map((person) => person.userId)).toEqual([ann.id]);
		expect(data.activeInvites.map((invite) => invite.code)).toEqual(['HOP-1']);
		expect(data.plan.used).toBe(1);
	});
});

describe('/family/create', () => {
	rollbackTest('answers the plan gate and both limits', async (db) => {
		const ann = await seedUser(db);
		const data = await invokeLoad(familyCreatePageLoad, {
			ctx: familyCtx(db),
			actor: actorFromUser(ann, 'session'),
			path: '/family/create'
		});
		expect(data.familyUsed).toBe(0);
		expect(data.familyLimitReached).toBe(false);
		expect(data.familyLimit).toBeGreaterThan(0);
		expect(data.memberLimit).toBeGreaterThan(0);
	});

	rollbackTest('sends an anonymous submit to /login, like the legacy action', async (db) => {
		const ctx = familyCtx(db);
		expect(
			await redirectOf(
				invokeAction(familyCreateAction, {
					ctx,
					path: '/family/create',
					form: { name: 'Rivera Home', color: '#c45e38', memberIds: [] }
				})
			)
		).toEqual({ status: 302, location: '/login' });
	});

	rollbackTest('creates the family and redirects into it', async (db) => {
		const ann = await seedUser(db);
		const result = await redirectOf(
			invokeAction(familyCreateAction, {
				ctx: familyCtx(db),
				actor: actorFromUser(ann, 'session'),
				path: '/family/create',
				form: { name: '  Rivera Home  ', color: '#c45e38', memberIds: [] }
			})
		);
		const rows = await db.select().from(families);
		expect(rows.map((row) => [row.name, row.color])).toEqual([['Rivera Home', '#c45e38']]);
		expect(result).toEqual({ status: 302, location: `/family/${rows[0].id}` });
		const roster = await db.select().from(familyMembers);
		expect(roster.map((row) => [row.userId, row.role])).toEqual([[ann.id, 'creator']]);
	});

	rollbackTest('echoes the typed name and colour when the name is blank', async (db) => {
		const ann = await seedUser(db);
		const failure = refusalOf<ActionFail & { name?: string; color?: string }>(
			await invokeAction(familyCreateAction, {
				ctx: familyCtx(db),
				actor: actorFromUser(ann, 'session'),
				path: '/family/create',
				form: { name: '   ', color: '#4d9c85', memberIds: [] }
			})
		);
		expect(failure.status).toBe(400);
		expect(failure.data).toMatchObject({
			success: false,
			error: 'Family name is required',
			name: '   ',
			color: '#4d9c85'
		});
		expect(await db.select().from(families)).toEqual([]);
	});
});

describe('/family/invitations load', () => {
	rollbackTest('chooses the named family, else the oldest, and hides codes from a plain member', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-old', { name: 'Oldest', createdAt: '2026-01-01T00:00:00.000Z' }, db);
		await seedFamily('fam-new', { name: 'Newest', createdAt: '2026-02-01T00:00:00.000Z' }, db);
		await seedMembership('fam-old', ann.id, 'member', 'member', db);
		await seedMembership('fam-new', ann.id, 'admin', 'parent', db);
		await seedInvite({ code: 'HOP-OLD', familyId: 'fam-old' }, db);
		await seedInvite({ code: 'HOP-NEW', familyId: 'fam-new' }, db);
		const ctx = familyCtx(db);

		const chosen = await invokeLoad(familyInvitationsPageLoad, {
			ctx,
			actor: actorFromUser(ann, 'session'),
			path: '/family/invitations',
			query: { familyId: 'fam-new' }
		});
		expect(chosen.family?.id).toBe('fam-new');
		expect(chosen.canManageInvites).toBe(true);
		expect(chosen.invitations.map((invite) => invite.code)).toEqual(['HOP-NEW']);

		const fallback = await invokeLoad(familyInvitationsPageLoad, {
			ctx,
			actor: actorFromUser(ann, 'session'),
			path: '/family/invitations'
		});
		expect(fallback.family?.id).toBe('fam-old');
		expect(fallback.canManageInvites).toBe(false);
		expect(fallback.invitations).toEqual([]);
		expect(fallback.memberships.map((membership) => membership.id)).toEqual(['fam-old', 'fam-new']);
	});
});

describe('/family/[familyId]/members/add load', () => {
	rollbackTest('names the family and shows the invite tab to an admin only', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-1', { name: 'Rivera Home' }, db);
		await seedMembership('fam-1', ann.id, 'admin', 'parent', db);
		const ctx = familyCtx(db);
		const data = await invokeLoad(familyAddMemberPageLoad, {
			ctx,
			actor: actorFromUser(ann, 'session'),
			path: '/family/fam-1/members/add',
			params: { familyId: 'fam-1' }
		});
		expect(data).toEqual({
			familyId: 'fam-1',
			familyName: 'Rivera Home',
			canInviteByEmail: true
		});
	});

	rollbackTest('falls back to the placeholder name for a family that is not there', async (db) => {
		const ann = await seedUser(db);
		const data = await invokeLoad(familyAddMemberPageLoad, {
			ctx: familyCtx(db),
			actor: actorFromUser(ann, 'session'),
			path: '/family/fam-404/members/add',
			params: { familyId: 'fam-404' }
		});
		expect(data).toEqual({
			familyId: 'fam-404',
			familyName: 'Family',
			canInviteByEmail: false
		});
	});
});

describe('/family/join/[code] load', () => {
	rollbackTest('answers a usable code with its family, signed in or not', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-1', { name: 'Rivera Home', color: '#c45e38' }, db);
		await seedMembership('fam-1', ann.id, 'creator', 'parent', db);
		await seedInvite({ code: 'HOP-1', familyId: 'fam-1' }, db);
		const ctx = familyCtx(db);

		const signedOut = await invokeLoad(familyJoinPageLoad, {
			ctx,
			path: '/family/join/HOP-1',
			params: { code: 'HOP-1' }
		});
		expect(signedOut).toEqual({
			invalid: false,
			family: { id: 'fam-1', name: 'Rivera Home', color: '#c45e38' },
			code: 'HOP-1',
			isLoggedIn: false
		});

		const signedIn = await invokeLoad(familyJoinPageLoad, {
			ctx,
			actor: actorFromUser(ann, 'session'),
			path: '/family/join/HOP-1',
			params: { code: 'HOP-1' }
		});
		expect(signedIn.isLoggedIn).toBe(true);
	});

	rollbackTest('answers an unknown or expired code in place instead of redirecting (issue 124)', async (db) => {
		const ctx = familyCtx(db);
		expect(
			await invokeLoad(familyJoinPageLoad, {
				ctx,
				path: '/family/join/NOPE',
				params: { code: 'NOPE' }
			})
		).toEqual({ invalid: true, family: null, code: 'NOPE', isLoggedIn: false });
	});
});
