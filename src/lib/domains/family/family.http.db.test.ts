/**
 * Golden contract for family's 18 /api methods (#292 G4, G10a–e), run against
 * the LEGACY route handlers on the real test database (committed mode, because
 * legacy writes through the `db` singleton). After the port the same file must
 * pass unchanged against the new handlers.
 *
 * Every test reads the wire as a client sees it: status, full body, exact error
 * copy, and the rows/notifications the next read can observe.
 *
 * `POST /api/families/{id}/members/email` is a spec golden: the legacy handler
 * imports `$env/static/private` and sends through Resend, so it cannot run in
 * the db project. See docs/rewrite/playbooks/characterize-endpoints.md.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	accounts,
	calendars,
	childConsentRecords,
	dashboardModuleSwitches,
	families,
	familyInviteCodes,
	familyMembers,
	notifications,
	tasks,
	users,
	userSettings
} from '$lib/kernel/db/tables.server';
import { invoke, type InvokeResult } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import { GET as listFamilies, POST as createFamily } from '../../../routes/api/families/+server';
import {
	GET as getFamily,
	PATCH as patchFamily
} from '../../../routes/api/families/[id]/+server';
import { GET as listInviteCodes } from '../../../routes/api/families/[id]/invite-codes/+server';
import {
	DELETE as deleteMember,
	PATCH as patchMember
} from '../../../routes/api/families/[id]/members/[userId]/+server';
import { POST as addChild } from '../../../routes/api/families/[id]/members/child/+server';
import { POST as addDirect } from '../../../routes/api/families/[id]/members/direct/+server';
import { POST as mintInviteLink } from '../../../routes/api/families/[id]/members/email/link/+server';
import {
	DELETE as revokeInvite,
	GET as previewInvite,
	POST as mintInvite
} from '../../../routes/api/family/invite/+server';
import { POST as joinFamily } from '../../../routes/api/family/join/+server';
import { GET as memberSearch } from '../../../routes/api/family/member-search/+server';
import { GET as getRoster } from '../../../routes/api/family/roster/+server';
import { GET as searchFamily } from '../../../routes/api/family/search/+server';

const ctx = () => testCtx({ db: testDb() });

/** SAFETY: the golden asserts or destructures the exact shape right after; this only narrows the kernel's JsonValue. */
function bodyOf<T>(res: InvokeResult): T {
	return res.body as T;
}

/** Whole days between two ISO instants (legacy mints on the real clock, so the gap is what we pin). */
function daysBetween(fromIso: string, toIso: string): number {
	return (Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000;
}

type SeededUser = typeof users.$inferSelect;

async function seedFamily(
	id: string,
	overrides: { name?: string; color?: string | null; createdAt?: string } = {}
) {
	const [row] = await testDb()
		.insert(families)
		.values({
			id,
			name: overrides.name ?? id,
			color: overrides.color ?? null,
			...(overrides.createdAt ? { createdAt: new Date(overrides.createdAt) } : {})
		})
		.returning();
	return row;
}

async function seedMembership(
	familyId: string,
	userId: string,
	role = 'member',
	memberType = 'member'
) {
	await testDb().insert(familyMembers).values({ familyId, userId, role, memberType });
}

async function seedInvite(overrides: {
	code: string;
	familyId: string;
	expiresAt?: string;
	maxUses?: number | null;
	useCount?: number | null;
	createdBy?: string | null;
}) {
	await testDb()
		.insert(familyInviteCodes)
		.values({
			code: overrides.code,
			familyId: overrides.familyId,
			expiresAt: new Date(overrides.expiresAt ?? '2099-01-01T00:00:00.000Z'),
			maxUses: overrides.maxUses === undefined ? 10 : overrides.maxUses,
			useCount: overrides.useCount === undefined ? 0 : overrides.useCount,
			createdBy: overrides.createdBy ?? null
		});
}

async function seedTask(overrides: {
	title: string;
	userId: string;
	familyId: string;
	assignedTo?: string | null;
	assignmentStatus?: string;
	completedAt?: string | null;
	archivedAt?: string | null;
}) {
	await testDb()
		.insert(tasks)
		.values({
			title: overrides.title,
			userId: overrides.userId,
			familyId: overrides.familyId,
			assignedTo: overrides.assignedTo ?? null,
			assignmentStatus: overrides.assignmentStatus ?? 'none',
			completedAt: overrides.completedAt ?? null,
			archivedAt: overrides.archivedAt ?? null
		});
}

/** ann (creator), bob (admin), cid (member), dee (member), out (not in the family). */
async function seedRoster() {
	const ann = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Rivera' });
	const bob = await seedUser(testDb(), { firstName: 'Bob', lastName: 'Stone' });
	const cid = await seedUser(testDb(), { firstName: 'Cid', lastName: 'Vale' });
	const dee = await seedUser(testDb(), { firstName: 'Dee', lastName: 'Wren' });
	const out = await seedUser(testDb(), { firstName: 'Out', lastName: 'Sider' });
	await seedFamily('fam-1', { name: 'Riveras', color: '#c45e38' });
	await seedMembership('fam-1', ann.id, 'creator', 'parent');
	await seedMembership('fam-1', bob.id, 'admin', 'parent');
	await seedMembership('fam-1', cid.id, 'member');
	await seedMembership('fam-1', dee.id, 'member');
	return { ann, bob, cid, dee, out };
}

/** A family already at the default plan's 6-member cap (creator + 5, bob is the admin). */
async function seedFullFamily() {
	const ann = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Rivera' });
	const bob = await seedUser(testDb(), { firstName: 'Bob', lastName: 'Stone' });
	const members: SeededUser[] = [];
	for (let i = 0; i < 4; i += 1) {
		members.push(await seedUser(testDb(), { firstName: `Member${i}`, lastName: 'Stone' }));
	}
	const out = await seedUser(testDb(), { firstName: 'Out', lastName: 'Sider' });
	await seedFamily('fam-full', { name: 'Full House' });
	await seedMembership('fam-full', ann.id, 'creator', 'parent');
	await seedMembership('fam-full', bob.id, 'admin', 'parent');
	for (const member of members) await seedMembership('fam-full', member.id, 'member');
	return { ann, bob, members, out };
}

async function memberRows(familyId: string) {
	return testDb().select().from(familyMembers).where(eq(familyMembers.familyId, familyId));
}

async function inviteRows(familyId: string) {
	return testDb().select().from(familyInviteCodes).where(eq(familyInviteCodes.familyId, familyId));
}

beforeEach(truncateAll);

describe('GET /api/families', () => {
	it('answers 401 Unauthorized when signed out', async () => {
		const res = await invoke(listFamilies, { ctx: ctx(), path: '/api/families' });
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers an empty overview for a user with no families', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(listFamilies, { ctx: ctx(), user, path: '/api/families' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			families: [],
			roster: [],
			activeInvites: [],
			plan: { used: 0, limit: 1 }
		});
	});

	it('orders families oldest first and builds each card from one read', async () => {
		const ann = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Rivera' });
		const bob = await seedUser(testDb(), { firstName: 'Bob', lastName: 'Stone' });
		const cid = await seedUser(testDb(), { firstName: 'Cid', lastName: 'Vale' });
		await seedFamily('fam-old', {
			name: 'Old House',
			createdAt: '2025-01-01T00:00:00.000Z'
		});
		await seedFamily('fam-mine', {
			name: 'Mine',
			color: '#4d9c85',
			createdAt: '2026-01-01T00:00:00.000Z'
		});
		await seedMembership('fam-old', ann.id, 'member', 'parent');
		await seedMembership('fam-mine', ann.id, 'creator', 'parent');
		await seedMembership('fam-old', bob.id);
		await seedMembership('fam-old', cid.id);
		await seedTask({ title: 'Open old', userId: ann.id, familyId: 'fam-old' });
		await seedTask({
			title: 'Done old',
			userId: ann.id,
			familyId: 'fam-old',
			completedAt: '2026-02-01T00:00:00.000Z'
		});
		await seedTask({ title: 'Open mine', userId: ann.id, familyId: 'fam-mine' });
		await seedInvite({ code: 'ACTIVE0001', familyId: 'fam-old', createdBy: ann.id });
		await seedInvite({
			code: 'EXPIRED001',
			familyId: 'fam-old',
			expiresAt: '2000-01-01T00:00:00.000Z'
		});
		await seedInvite({ code: 'USEDUP0001', familyId: 'fam-mine', maxUses: 1, useCount: 1 });

		const res = await invoke(listFamilies, { ctx: ctx(), user: ann, path: '/api/families' });
		const body = bodyOf<{
			families: unknown[];
			roster: { familyId: string; userId: string }[];
			activeInvites: unknown[];
		}>(res);

		expect(res.status).toBe(200);
		expect(body.families).toEqual([
			{
				id: 'fam-old',
				name: 'Old House',
				color: null,
				createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
				memberCount: 3,
				openTasks: 1,
				members: [
					{ firstName: 'Ann', userId: ann.id },
					{ firstName: 'Bob', userId: bob.id },
					{ firstName: 'Cid', userId: cid.id }
				],
				createdLabel: expect.any(String),
				canInvite: false,
				role: 'member'
			},
			{
				id: 'fam-mine',
				name: 'Mine',
				color: '#4d9c85',
				createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
				memberCount: 1,
				openTasks: 1,
				members: [{ firstName: 'Ann', userId: ann.id }],
				createdLabel: expect.any(String),
				canInvite: true,
				role: 'creator'
			}
		]);
		const sortRow = (row: { familyId: string; userId: string }) =>
			`${row.familyId}:${row.userId}`;
		expect([...body.roster].sort((a, b) => sortRow(a).localeCompare(sortRow(b)))).toEqual(
			[
				{ familyId: 'fam-old', userId: ann.id, firstName: 'Ann', lastName: 'Rivera', role: 'member', memberType: 'parent' },
				{ familyId: 'fam-mine', userId: ann.id, firstName: 'Ann', lastName: 'Rivera', role: 'creator', memberType: 'parent' },
				{ familyId: 'fam-old', userId: bob.id, firstName: 'Bob', lastName: 'Stone', role: 'member', memberType: 'member' },
				{ familyId: 'fam-old', userId: cid.id, firstName: 'Cid', lastName: 'Vale', role: 'member', memberType: 'member' }
			].sort((a, b) => sortRow(a).localeCompare(sortRow(b)))
		);
		expect(body.activeInvites).toEqual([
			{
				familyId: 'fam-old',
				code: 'ACTIVE0001',
				useCount: 0,
				maxUses: 10,
				expiresAt: '2099-01-01T00:00:00.000Z'
			}
		]);
		expect(bodyOf<{ plan: unknown }>(res).plan).toEqual({ used: 2, limit: 1 });
	});
});

describe('GET /api/families/{id}', () => {
	it('answers 401 Unauthorized when signed out', async () => {
		const res = await invoke(getFamily, {
			ctx: ctx(),
			params: { id: 'fam-1' },
			path: '/api/families/fam-1'
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 404 Family not found for a non-member, the same as a missing family', async () => {
		const ann = await seedUser(testDb(), { firstName: 'Ann' });
		const out = await seedUser(testDb(), { firstName: 'Out' });
		await seedFamily('fam-1', { name: 'Riveras' });
		await seedMembership('fam-1', ann.id, 'creator');

		const stranger = await invoke(getFamily, {
			ctx: ctx(),
			user: out,
			params: { id: 'fam-1' },
			path: '/api/families/fam-1'
		});
		expect(stranger.status).toBe(404);
		expect(stranger.body).toEqual({ error: 'Family not found' });

		const missing = await invoke(getFamily, {
			ctx: ctx(),
			user: ann,
			params: { id: 'nope' },
			path: '/api/families/nope'
		});
		expect(missing.status).toBe(404);
		expect(missing.body).toEqual({ error: 'Family not found' });
	});

	it('answers the whole detail payload for a member', async () => {
		const ann = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Rivera' });
		await seedFamily('fam-1', { name: 'Riveras', color: '#c45e38' });
		await seedMembership('fam-1', ann.id, 'creator', 'parent');
		await seedInvite({
			code: 'LIVE000001',
			familyId: 'fam-1',
			useCount: 2,
			maxUses: 5,
			createdBy: ann.id
		});
		await testDb()
			.insert(userSettings)
			.values({ userId: ann.id, hiddenDashboardModules: ['verse'] });
		await testDb()
			.insert(dashboardModuleSwitches)
			.values({ familyId: 'fam-1', module: 'board', enabled: false });

		const res = await invoke(getFamily, {
			ctx: ctx(),
			user: ann,
			params: { id: 'fam-1' },
			path: '/api/families/fam-1'
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			family: {
				id: 'fam-1',
				name: 'Riveras',
				color: '#c45e38',
				createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
			},
			members: [
				{
					userId: ann.id,
					firstName: 'Ann',
					lastName: 'Rivera',
					email: ann.email,
					role: 'creator',
					memberType: 'parent'
				}
			],
			currentUserRole: 'creator',
			currentUserId: ann.id,
			activity: [],
			moduleSwitches: { board: false, kids: true, groceries: true, meals: true },
			hiddenDashboardModules: ['verse'],
			activeInvite: {
				code: 'LIVE000001',
				useCount: 2,
				maxUses: 5,
				expiresAt: '2099-01-01T00:00:00.000Z'
			},
			inviteCreatedBy: 'Ann',
			planUsage: {
				tierName: null,
				aiUsed: 0,
				aiLimit: 10,
				familiesUsed: 1,
				familyLimit: 1,
				members: 1,
				memberLimit: 6,
				archivedRetentionDays: 90,
				exportImportEnabled: true
			}
		});
	});

	it('carries every roster row, role and Member Type side by side', async () => {
		const ann = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Rivera' });
		const bob = await seedUser(testDb(), { firstName: 'Bob', lastName: 'Stone' });
		await seedFamily('fam-1');
		await seedMembership('fam-1', ann.id, 'creator', 'parent');
		await seedMembership('fam-1', bob.id, 'admin', 'child');

		const res = await invoke(getFamily, {
			ctx: ctx(),
			user: ann,
			params: { id: 'fam-1' },
			path: '/api/families/fam-1'
		});
		const body = bodyOf<{
			members: { userId: string; role: string | null; memberType: string | null }[];
		}>(res);
		expect(
			[...body.members].sort((a, b) => a.userId.localeCompare(b.userId))
		).toEqual(
			[
				{ userId: ann.id, firstName: 'Ann', lastName: 'Rivera', email: ann.email, role: 'creator', memberType: 'parent' },
				{ userId: bob.id, firstName: 'Bob', lastName: 'Stone', email: bob.email, role: 'admin', memberType: 'child' }
			].sort((a, b) => a.userId.localeCompare(b.userId))
		);
	});
});

describe('PATCH /api/families/{id}', () => {
	it('answers 401 Unauthorized when signed out', async () => {
		await seedFamily('fam-1');
		const res = await invoke(patchFamily, {
			ctx: ctx(),
			method: 'PATCH',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1',
			body: { name: 'X' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 400 Invalid JSON for a malformed or non-object body', async () => {
		const { ann } = await seedRoster();
		const malformed = await invoke(patchFamily, {
			ctx: ctx(),
			user: ann,
			method: 'PATCH',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1',
			rawBody: '{'
		});
		expect(malformed.status).toBe(400);
		expect(malformed.body).toEqual({ error: 'Invalid JSON' });

		const nonObject = await invoke(patchFamily, {
			ctx: ctx(),
			user: ann,
			method: 'PATCH',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1',
			rawBody: '[]'
		});
		expect(nonObject.status).toBe(400);
		expect(nonObject.body).toEqual({ error: 'Invalid JSON' });
	});

	it('answers 400 for a blank or non-string name, and for a malformed colour', async () => {
		const { bob } = await seedRoster();
		const blank = await invoke(patchFamily, {
			ctx: ctx(),
			user: bob,
			method: 'PATCH',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1',
			body: { name: '   ' }
		});
		expect(blank.status).toBe(400);
		expect(blank.body).toEqual({ error: 'Invalid name' });

		const nonString = await invoke(patchFamily, {
			ctx: ctx(),
			user: bob,
			method: 'PATCH',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1',
			body: { name: 5 }
		});
		expect(nonString.status).toBe(400);
		expect(nonString.body).toEqual({ error: 'Invalid name' });

		const colour = await invoke(patchFamily, {
			ctx: ctx(),
			user: bob,
			method: 'PATCH',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1',
			body: { color: 'green' }
		});
		expect(colour.status).toBe(400);
		expect(colour.body).toEqual({ error: 'Invalid color' });
	});

	it('answers 403 for a plain member and for a non-member', async () => {
		const { cid, out } = await seedRoster();
		const member = await invoke(patchFamily, {
			ctx: ctx(),
			user: cid,
			method: 'PATCH',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1',
			body: { name: 'X' }
		});
		expect(member.status).toBe(403);
		expect(member.body).toEqual({ error: 'You do not have permission to perform this action' });

		const stranger = await invoke(patchFamily, {
			ctx: ctx(),
			user: out,
			method: 'PATCH',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1',
			body: { name: 'X' }
		});
		expect(stranger.status).toBe(403);
		expect(stranger.body).toEqual({ error: 'You do not have permission to perform this action' });
	});

	it('renames for an admin, trimming the name and leaving the colour alone', async () => {
		const { bob } = await seedRoster();
		const res = await invoke(patchFamily, {
			ctx: ctx(),
			user: bob,
			method: 'PATCH',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1',
			body: { name: ' Riveras ' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			success: true,
			family: {
				id: 'fam-1',
				name: 'Riveras',
				color: '#c45e38',
				createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
			}
		});
	});

	it('leaves both fields untouched when the body carries neither', async () => {
		const { bob } = await seedRoster();
		const res = await invoke(patchFamily, {
			ctx: ctx(),
			user: bob,
			method: 'PATCH',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1',
			body: {}
		});
		expect(res.status).toBe(200);
		const [row] = await testDb().select().from(families).where(eq(families.id, 'fam-1'));
		expect([row.name, row.color]).toEqual(['Riveras', '#c45e38']);
	});

	it('accepts a hex colour outside the palette (create offers six)', async () => {
		const { bob } = await seedRoster();
		const res = await invoke(patchFamily, {
			ctx: ctx(),
			user: bob,
			method: 'PATCH',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1',
			body: { color: '#000001' }
		});
		expect(res.status).toBe(200);
		expect(bodyOf<{ family: { color: string } }>(res).family.color).toBe('#000001');
		const [row] = await testDb().select().from(families).where(eq(families.id, 'fam-1'));
		expect(row.color).toBe('#000001');
	});
});

describe('PATCH /api/families/{id}/members/{userId}', () => {
	const patch = async (actor: SeededUser, userId: string, body: JsonValue) =>
		invoke(patchMember, {
			ctx: ctx(),
			user: actor,
			method: 'PATCH',
			params: { id: 'fam-1', userId },
			path: `/api/families/fam-1/members/${userId}`,
			body
		});

	it('answers 401 Unauthorized when signed out', async () => {
		const { cid } = await seedRoster();
		const res = await invoke(patchMember, {
			ctx: ctx(),
			method: 'PATCH',
			params: { id: 'fam-1', userId: cid.id },
			path: `/api/families/fam-1/members/${cid.id}`,
			body: { role: 'admin' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('requires at least one field, and treats null differently from absent', async () => {
		const { bob, cid } = await seedRoster();
		const neither = await patch(bob, cid.id, {});
		expect(neither.status).toBe(400);
		expect(neither.body).toEqual({ error: 'role or memberType is required' });

		const nullRole = await patch(bob, cid.id, { role: null });
		expect(nullRole.status).toBe(400);
		expect(nullRole.body).toEqual({ error: 'User ID and role are required' });

		const nullType = await patch(bob, cid.id, { memberType: null });
		expect(nullType.status).toBe(400);
		expect(nullType.body).toEqual({ error: 'User ID and member type are required' });
	});

	it('answers 400 Invalid JSON for a malformed body', async () => {
		const { bob, cid } = await seedRoster();
		const res = await invoke(patchMember, {
			ctx: ctx(),
			user: bob,
			method: 'PATCH',
			params: { id: 'fam-1', userId: cid.id },
			path: `/api/families/fam-1/members/${cid.id}`,
			rawBody: '{'
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid JSON' });
	});

	it('validates the role vocabulary', async () => {
		const { bob, cid } = await seedRoster();
		const res = await patch(bob, cid.id, { role: 'owner' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Role must be creator, admin, or member' });
	});

	it('answers 403 for a non-member and for a plain member', async () => {
		const { cid, dee, out } = await seedRoster();
		const stranger = await patch(out, cid.id, { role: 'admin' });
		expect(stranger.status).toBe(403);
		expect(stranger.body).toEqual({ error: 'You do not have permission' });

		const plain = await patch(cid, dee.id, { role: 'admin' });
		expect(plain.status).toBe(403);
		expect(plain.body).toEqual({ error: 'You do not have permission' });
	});

	it('refuses to let anyone change their own role', async () => {
		const { ann } = await seedRoster();
		const res = await patch(ann, ann.id, { role: 'admin' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Cannot change your own role' });
	});

	it('answers Member not found for an unknown target', async () => {
		const { bob } = await seedRoster();
		const res = await patch(bob, 'ghost', { role: 'member' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Member not found' });
	});

	it("leaves the creator's role untouchable", async () => {
		const { bob, ann } = await seedRoster();
		const res = await patch(bob, ann.id, { role: 'member' });
		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: "Cannot change the family creator's role" });
		const [row] = await testDb()
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, ann.id));
		expect(row.role).toBe('creator');
	});

	it('lets only the creator promote to creator', async () => {
		const { bob, cid } = await seedRoster();
		const res = await patch(bob, cid.id, { role: 'creator' });
		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'Only the creator can promote to creator' });
	});

	it('applies the role first and stops at its first refusal', async () => {
		const { bob, cid } = await seedRoster();
		const res = await patch(bob, cid.id, { role: 'owner', memberType: 'parent' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Role must be creator, admin, or member' });
		const [row] = await testDb()
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, cid.id));
		expect([row.role, row.memberType]).toEqual(['member', 'member']);
	});

	it('updates role and Member Type as separate columns', async () => {
		const { bob, cid } = await seedRoster();
		const res = await patch(bob, cid.id, { role: 'admin', memberType: 'parent' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const [row] = await testDb()
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, cid.id));
		expect([row.role, row.memberType]).toEqual(['admin', 'parent']);
	});

	it('validates Member Type and keeps the role when it refuses', async () => {
		const { bob, cid } = await seedRoster();
		const res = await patch(bob, cid.id, { role: 'admin', memberType: 'adult' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Member type must be parent, child, or member' });
		const [row] = await testDb()
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, cid.id));
		expect([row.role, row.memberType]).toEqual(['admin', 'member']);
	});

	it('makes Member Type admin-only and leaves the role alone', async () => {
		const { bob, cid, dee } = await seedRoster();
		const plain = await patch(cid, dee.id, { memberType: 'parent' });
		expect(plain.status).toBe(403);
		expect(plain.body).toEqual({ error: 'You do not have permission to perform this action' });

		const target = await patch(bob, 'ghost', { memberType: 'parent' });
		expect(target.status).toBe(400);
		expect(target.body).toEqual({ error: 'Member not found' });

		const ok = await patch(bob, dee.id, { memberType: 'child' });
		expect(ok.status).toBe(200);
		expect(ok.body).toEqual({ success: true });
		const [row] = await testDb()
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, dee.id));
		expect([row.role, row.memberType]).toEqual(['member', 'child']);
	});
});

describe('DELETE /api/families/{id}/members/{userId}', () => {
	const remove = async (actor: SeededUser, familyId: string, userId: string) =>
		invoke(deleteMember, {
			ctx: ctx(),
			user: actor,
			method: 'DELETE',
			params: { id: familyId, userId },
			path: `/api/families/${familyId}/members/${userId}`
		});

	it('answers 401 Unauthorized when signed out', async () => {
		const { cid } = await seedRoster();
		const res = await invoke(deleteMember, {
			ctx: ctx(),
			method: 'DELETE',
			params: { id: 'fam-1', userId: cid.id },
			path: `/api/families/fam-1/members/${cid.id}`
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers User ID is required for an empty path id', async () => {
		const { bob } = await seedRoster();
		const res = await remove(bob, 'fam-1', '');
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'User ID is required' });
	});

	it('refuses the creator before it even checks who is asking', async () => {
		const { ann, out } = await seedRoster();
		const res = await remove(out, 'fam-1', ann.id);
		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'Cannot remove the family creator' });
		expect(await memberRows('fam-1')).toHaveLength(4);
	});

	it('refuses a plain member and a non-member', async () => {
		const { cid, dee, out } = await seedRoster();
		const plain = await remove(cid, 'fam-1', dee.id);
		expect(plain.status).toBe(403);
		expect(plain.body).toEqual({ error: 'You do not have permission to perform this action' });

		const stranger = await remove(out, 'fam-1', dee.id);
		expect(stranger.status).toBe(403);
		expect(stranger.body).toEqual({ error: 'You do not have permission to perform this action' });
	});

	it("removes the roster row and un-assigns that person's family tasks", async () => {
		const { bob, cid } = await seedRoster();
		await seedTask({
			title: 'Cid task',
			userId: bob.id,
			familyId: 'fam-1',
			assignedTo: cid.id,
			assignmentStatus: 'accepted'
		});
		await seedTask({
			title: 'Bob task',
			userId: bob.id,
			familyId: 'fam-1',
			assignedTo: bob.id,
			assignmentStatus: 'accepted'
		});

		const res = await remove(bob, 'fam-1', cid.id);
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });

		expect((await memberRows('fam-1')).map((row) => row.userId)).not.toContain(cid.id);
		const rows = await testDb().select().from(tasks).where(eq(tasks.familyId, 'fam-1'));
		const byTitle = (title: string) => rows.find((row) => row.title === title);
		expect([byTitle('Cid task')?.assignedTo, byTitle('Cid task')?.assignmentStatus]).toEqual([
			null,
			'none'
		]);
		expect([byTitle('Bob task')?.assignedTo, byTitle('Bob task')?.assignmentStatus]).toEqual([
			bob.id,
			'accepted'
		]);
	});

	it('answers a no-op success for a target who is not a member', async () => {
		const { bob, out } = await seedRoster();
		const res = await remove(bob, 'fam-1', out.id);
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await memberRows('fam-1')).toHaveLength(4);
	});
});

describe('POST /api/families', () => {
	const create = async (user: SeededUser, body: JsonValue) =>
		invoke(createFamily, { ctx: ctx(), user, path: '/api/families', method: 'POST', body });

	it('answers 401 Unauthorized when signed out', async () => {
		const res = await invoke(createFamily, {
			ctx: ctx(),
			method: 'POST',
			path: '/api/families',
			body: { name: 'Riveras' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 400 Invalid JSON for malformed and non-object bodies', async () => {
		const ann = await seedUser(testDb());
		const malformed = await invoke(createFamily, {
			ctx: ctx(),
			user: ann,
			method: 'POST',
			path: '/api/families',
			rawBody: '{'
		});
		expect(malformed.status).toBe(400);
		expect(malformed.body).toEqual({ error: 'Invalid JSON' });

		const nonObject = await invoke(createFamily, {
			ctx: ctx(),
			user: ann,
			method: 'POST',
			path: '/api/families',
			rawBody: '[]'
		});
		expect(nonObject.status).toBe(400);
		expect(nonObject.body).toEqual({ error: 'Invalid JSON' });
	});

	it('answers memberIds must be an array before the plan gate runs', async () => {
		const ann = await seedUser(testDb());
		// Already at the family limit: a gate-first handler would answer 403 here.
		await seedFamily('fam-1');
		await seedMembership('fam-1', ann.id, 'creator');
		for (const memberIds of ['u2', null]) {
			const res = await create(ann, { name: 'Riveras', memberIds });
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'memberIds must be an array' });
		}
	});

	it('answers 403 with the plan reason and upgradeRequired at the family limit', async () => {
		const ann = await seedUser(testDb());
		await seedFamily('fam-1');
		await seedMembership('fam-1', ann.id, 'creator');
		const res = await create(ann, { name: 'Riveras' });
		expect(res.status).toBe(403);
		expect(res.body).toEqual({
			error: 'Family limit reached (1). Upgrade to create more families.',
			upgradeRequired: true
		});
		expect(await testDb().select().from(families)).toHaveLength(1);
	});

	it('answers 400 for a missing name, an over-long name and a non-palette colour', async () => {
		const ann = await seedUser(testDb());
		expect(await create(ann, {})).toMatchObject({
			status: 400,
			body: { error: 'Family name is required' }
		});
		expect(await create(ann, { name: null })).toMatchObject({
			status: 400,
			body: { error: 'Family name is required' }
		});
		expect(await create(ann, { name: 'x'.repeat(51) })).toMatchObject({
			status: 400,
			body: { error: 'Family name must be 50 characters or less' }
		});
		expect(await create(ann, { name: 'Riveras', color: '#000001' })).toMatchObject({
			status: 400,
			body: { error: 'Pick one of the offered family colours' }
		});
	});

	it('refuses a picked person who is not a verified account', async () => {
		const ann = await seedUser(testDb());
		const unverified = await seedUser(testDb(), { emailVerified: false });
		const res = await create(ann, { name: 'Riveras', memberIds: [unverified.id] });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({
			error: 'One of the people you picked cannot be added yet — send them an email invite instead.'
		});
	});

	it('refuses more picks than the plan allows in one family', async () => {
		const ann = await seedUser(testDb());
		const picks: SeededUser[] = [];
		for (let i = 0; i < 6; i += 1) picks.push(await seedUser(testDb()));
		const res = await create(ann, { name: 'Riveras', memberIds: picks.map((user) => user.id) });
		expect(res.status).toBe(403);
		expect(res.body).toEqual({
			error:
				'Your plan allows 6 members in a family. Create the family first, then add the rest from the family page.'
		});
		expect(await testDb().select().from(families)).toHaveLength(0);
	});

	it('creates the family with the default palette colour, deduped picks and a calendar', async () => {
		const ann = await seedUser(testDb(), { firstName: 'Ann' });
		const bob = await seedUser(testDb(), { firstName: 'Bob' });
		const res = await create(ann, {
			name: ' Riveras ',
			memberIds: [bob.id, ann.id, bob.id, '  ']
		});
		expect(res.status).toBe(201);
		const body = bodyOf<{ family: { id: string; name: string; color: string } }>(res);
		expect(body.family).toEqual({
			id: expect.any(String),
			name: 'Riveras',
			color: '#c45e38',
			createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
		});

		const members = (await memberRows(body.family.id)).sort((a, b) =>
			a.userId.localeCompare(b.userId)
		);
		expect(members.map((row) => [row.userId, row.role, row.memberType])).toEqual(
			[
				[ann.id, 'creator', 'member'],
				[bob.id, 'member', 'member']
			].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
		);
		const calendarRows = await testDb()
			.select()
			.from(calendars)
			.where(eq(calendars.familyId, body.family.id));
		expect(calendarRows).toHaveLength(1);
	});

	it('stores a palette colour when one is offered', async () => {
		const ann = await seedUser(testDb());
		const res = await create(ann, { name: 'Riveras', color: '#4d9c85' });
		expect(res.status).toBe(201);
		expect(bodyOf<{ family: { color: string } }>(res).family.color).toBe('#4d9c85');
	});

	it('treats a null colour as absent and uses the default', async () => {
		const ann = await seedUser(testDb());
		const res = await create(ann, { name: 'Riveras', color: null });
		expect(res.status).toBe(201);
		expect(bodyOf<{ family: { color: string } }>(res).family.color).toBe('#c45e38');
	});
});

describe('GET /api/families/{id}/invite-codes', () => {
	it('answers 401 Unauthorized when signed out', async () => {
		await seedFamily('fam-1');
		const res = await invoke(listInviteCodes, {
			ctx: ctx(),
			params: { id: 'fam-1' },
			path: '/api/families/fam-1/invite-codes'
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers 404 for a family you are not in and for one that does not exist', async () => {
		const { ann, out } = await seedRoster();
		await seedFamily('fam-2', { name: 'Other House' });

		// ann belongs to fam-1; asking for fam-2 must not fall back to fam-1.
		const fallbackTrap = await invoke(listInviteCodes, {
			ctx: ctx(),
			user: ann,
			params: { id: 'fam-2' },
			path: '/api/families/fam-2/invite-codes'
		});
		expect(fallbackTrap.status).toBe(404);
		expect(fallbackTrap.body).toEqual({ error: 'Family not found' });

		const stranger = await invoke(listInviteCodes, {
			ctx: ctx(),
			user: out,
			params: { id: 'fam-1' },
			path: '/api/families/fam-1/invite-codes'
		});
		expect(stranger.status).toBe(404);
		expect(stranger.body).toEqual({ error: 'Family not found' });

		const missing = await invoke(listInviteCodes, {
			ctx: ctx(),
			user: out,
			params: { id: 'nope' },
			path: '/api/families/nope/invite-codes'
		});
		expect(missing.status).toBe(404);
		expect(missing.body).toEqual({ error: 'Family not found' });
	});

	it('hides the codes from a plain member', async () => {
		const { cid } = await seedRoster();
		await seedInvite({ code: 'SECRET0001', familyId: 'fam-1' });
		const res = await invoke(listInviteCodes, {
			ctx: ctx(),
			user: cid,
			params: { id: 'fam-1' },
			path: '/api/families/fam-1/invite-codes'
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ canManageInvites: false, codes: [] });
	});

	it('lists every code, expired ones included, for the creator', async () => {
		const { ann } = await seedRoster();
		await seedInvite({ code: 'AAA', familyId: 'fam-1', createdBy: ann.id });
		await seedInvite({
			code: 'BBB',
			familyId: 'fam-1',
			expiresAt: '2000-01-01T00:00:00.000Z',
			maxUses: null,
			useCount: null
		});
		const res = await invoke(listInviteCodes, {
			ctx: ctx(),
			user: ann,
			params: { id: 'fam-1' },
			path: '/api/families/fam-1/invite-codes'
		});
		const body = bodyOf<{ canManageInvites: boolean; codes: { code: string }[] }>(res);
		expect(body.canManageInvites).toBe(true);
		expect([...body.codes].sort((a, b) => a.code.localeCompare(b.code))).toEqual([
			{
				code: 'AAA',
				useCount: 0,
				maxUses: 10,
				expiresAt: '2099-01-01T00:00:00.000Z',
				createdBy: ann.id
			},
			{
				code: 'BBB',
				useCount: 0,
				maxUses: null,
				expiresAt: '2000-01-01T00:00:00.000Z',
				createdBy: null
			}
		]);
	});
});

describe('POST /api/family/invite (mint)', () => {
	const mint = async (user: SeededUser, body: JsonValue) =>
		invoke(mintInvite, { ctx: ctx(), user, path: '/api/family/invite', method: 'POST', body });

	it('answers 401 Unauthorized when signed out', async () => {
		const res = await invoke(mintInvite, {
			ctx: ctx(),
			method: 'POST',
			path: '/api/family/invite',
			body: { familyId: 'fam-1' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('refuses a non-member, a null family id and a plain member', async () => {
		const { cid, out } = await seedRoster();
		const stranger = await mint(out, { familyId: 'fam-1' });
		expect(stranger.status).toBe(403);
		expect(stranger.body).toEqual({ error: 'You are not a member of this family' });

		const nullFamily = await mint(out, { familyId: null });
		expect(nullFamily.status).toBe(403);
		expect(nullFamily.body).toEqual({ error: 'You are not a member of this family' });

		const plain = await mint(cid, { familyId: 'fam-1' });
		expect(plain.status).toBe(403);
		expect(plain.body).toEqual({
			error: 'Only the family creator or an admin can create invitations'
		});
	});

	it('mints a 10-use, 7-day code by default and returns its join url', async () => {
		const { ann } = await seedRoster();
		const res = await mint(ann, { familyId: 'fam-1' });
		expect(res.status).toBe(200);
		const body = bodyOf<{ code: string; expiresAt: string; inviteUrl: string }>(res);
		expect(body).toEqual({
			code: expect.stringMatching(/^[a-z0-9]{10}$/),
			expiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
			inviteUrl: `/family/join/${body.code}`
		});
		const [row] = (await inviteRows('fam-1')).filter((invite) => invite.code === body.code);
		expect([row.maxUses, row.useCount, row.createdBy]).toEqual([10, 0, ann.id]);
	});

	it('clamps validity to 1–30 days and uses to 1–50', async () => {
		const { ann } = await seedRoster();
		const base = bodyOf<{ expiresAt: string }>(await mint(ann, { familyId: 'fam-1' }));
		const max = bodyOf<{ code: string; expiresAt: string }>(
			await mint(ann, { familyId: 'fam-1', expiresInDays: 100, maxUses: 999 })
		);
		const min = bodyOf<{ code: string; expiresAt: string }>(
			await mint(ann, { familyId: 'fam-1', expiresInDays: 0, maxUses: 0 })
		);
		const rows = await inviteRows('fam-1');
		const rowFor = (code: string) => rows.find((invite) => invite.code === code);

		expect(rowFor(max.code)?.maxUses).toBe(50);
		expect(rowFor(min.code)?.maxUses).toBe(1);
		expect(daysBetween(base.expiresAt, max.expiresAt)).toBeGreaterThan(22.9);
		expect(daysBetween(base.expiresAt, max.expiresAt)).toBeLessThan(23.1);
		expect(daysBetween(base.expiresAt, min.expiresAt)).toBeGreaterThan(-6.1);
		expect(daysBetween(base.expiresAt, min.expiresAt)).toBeLessThan(-5.9);
	});

	it('reads numeric strings through the same clamp', async () => {
		const { ann } = await seedRoster();
		const res = await mint(ann, { familyId: 'fam-1', expiresInDays: '3', maxUses: '3' });
		const body = bodyOf<{ code: string }>(res);
		const [row] = (await inviteRows('fam-1')).filter((invite) => invite.code === body.code);
		expect(row.maxUses).toBe(3);
	});
});

describe('GET /api/family/invite (preview)', () => {
	it('answers Invite code is required for a missing or empty code', async () => {
		const missing = await invoke(previewInvite, {
			ctx: ctx(),
			path: '/api/family/invite'
		});
		expect(missing.status).toBe(400);
		expect(missing.body).toEqual({ error: 'Invite code is required' });

		const blank = await invoke(previewInvite, {
			ctx: ctx(),
			path: '/api/family/invite?code='
		});
		expect(blank.status).toBe(400);
		expect(blank.body).toEqual({ error: 'Invite code is required' });
	});

	it('answers the family and isAlreadyMember, signed in or out', async () => {
		const { ann, out } = await seedRoster();
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-1', createdBy: ann.id });

		const anonymous = await invoke(previewInvite, {
			ctx: ctx(),
			path: '/api/family/invite?code=LIVE000001'
		});
		expect(anonymous.status).toBe(200);
		expect(anonymous.body).toEqual({
			family: { id: 'fam-1', name: 'Riveras', color: '#c45e38' },
			isAlreadyMember: false
		});

		const member = await invoke(previewInvite, {
			ctx: ctx(),
			user: ann,
			path: '/api/family/invite?code=LIVE000001'
		});
		expect(member.status).toBe(200);
		expect(bodyOf<{ isAlreadyMember: boolean }>(member).isAlreadyMember).toBe(true);

		const stranger = await invoke(previewInvite, {
			ctx: ctx(),
			user: out,
			path: '/api/family/invite?code=LIVE000001'
		});
		expect(bodyOf<{ isAlreadyMember: boolean }>(stranger).isAlreadyMember).toBe(false);
	});

	it('answers 404 for unknown, expired and used-up codes', async () => {
		await seedFamily('fam-1');
		await seedInvite({
			code: 'EXPIRED001',
			familyId: 'fam-1',
			expiresAt: '2000-01-01T00:00:00.000Z'
		});
		await seedInvite({ code: 'USEDUP0001', familyId: 'fam-1', maxUses: 1, useCount: 1 });

		for (const code of ['NOPE', 'EXPIRED001', 'USEDUP0001']) {
			const res = await invoke(previewInvite, {
				ctx: ctx(),
				path: `/api/family/invite?code=${code}`
			});
			expect(res.status).toBe(404);
			expect(res.body).toEqual({ error: 'Invalid or expired invite code' });
		}
	});

	it('does not increment useCount when a link is only opened', async () => {
		await seedFamily('fam-1');
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-1', useCount: 0, maxUses: 10 });
		await invoke(previewInvite, {
			ctx: ctx(),
			path: '/api/family/invite?code=LIVE000001'
		});
		const [row] = await testDb()
			.select()
			.from(familyInviteCodes)
			.where(eq(familyInviteCodes.code, 'LIVE000001'));
		expect(row.useCount).toBe(0);
	});
});

describe('DELETE /api/family/invite (revoke)', () => {
	const revoke = async (user: SeededUser | null, body: JsonValue) =>
		invoke(revokeInvite, {
			ctx: ctx(),
			...(user ? { user } : {}),
			method: 'DELETE',
			path: '/api/family/invite',
			body
		});

	it('answers 401 Unauthorized when signed out', async () => {
		await seedFamily('fam-1');
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-1' });
		const res = await revoke(null, { code: 'LIVE000001' });
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers Invite code is required for an absent, empty or null code', async () => {
		const { ann } = await seedRoster();
		for (const body of [{}, { code: '' }, { code: null }]) {
			const res = await revoke(ann, body);
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invite code is required' });
		}
	});

	it('answers 404 for an unknown code', async () => {
		const { ann } = await seedRoster();
		const res = await revoke(ann, { code: 'NOPE' });
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Invite code not found' });
	});

	it('refuses a non-member and a plain member of the code\'s family', async () => {
		const { cid, out } = await seedRoster();
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-1' });

		const stranger = await revoke(out, { code: 'LIVE000001' });
		expect(stranger.status).toBe(403);
		expect(stranger.body).toEqual({ error: 'You are not a member of this family' });

		const plain = await revoke(cid, { code: 'LIVE000001' });
		expect(plain.status).toBe(403);
		expect(plain.body).toEqual({
			error: 'Only the family creator or an admin can revoke invitations'
		});
	});

	it('deletes the code for an admin', async () => {
		const { bob } = await seedRoster();
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-1' });
		const res = await revoke(bob, { code: 'LIVE000001' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await inviteRows('fam-1')).toHaveLength(0);
	});
});

describe('POST /api/family/join', () => {
	const join = async (user: SeededUser | null, body: JsonValue) =>
		invoke(joinFamily, {
			ctx: ctx(),
			...(user ? { user } : {}),
			method: 'POST',
			path: '/api/family/join',
			body
		});

	it('answers 401 Unauthorized when signed out', async () => {
		const res = await join(null, { code: 'LIVE000001' });
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers Invite code is required for an absent or empty code', async () => {
		const user = await seedUser(testDb());
		for (const body of [{}, { code: '' }, { code: null }]) {
			const res = await join(user, body);
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invite code is required' });
		}
	});

	it('refuses an unknown, expired, used-up or already-joined code with one answer', async () => {
		const { ann } = await seedRoster();
		await seedInvite({
			code: 'EXPIRED001',
			familyId: 'fam-1',
			expiresAt: '2000-01-01T00:00:00.000Z'
		});
		await seedInvite({ code: 'USEDUP0001', familyId: 'fam-1', maxUses: 1, useCount: 1 });
		const joiner = await seedUser(testDb());

		for (const [user, code] of [
			[joiner, 'NOPE'],
			[joiner, 'EXPIRED001'],
			[joiner, 'USEDUP0001']
		] as const) {
			const res = await join(user, { code });
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invalid, expired, or already used invite code' });
		}

		await seedInvite({ code: 'MEMBER0001', familyId: 'fam-1' });
		const already = await join(ann, { code: 'MEMBER0001' });
		expect(already.status).toBe(400);
		expect(already.body).toEqual({ error: 'Invalid, expired, or already used invite code' });
	});

	it('answers 403 when the family is at its member limit', async () => {
		const { out } = await seedFullFamily();
		await seedInvite({ code: 'FULLINVITE', familyId: 'fam-full' });
		const res = await join(out, { code: 'FULLINVITE' });
		expect(res.status).toBe(403);
		expect(res.body).toEqual({
			error: 'This family is full. The subscription member limit does not allow more members.'
		});
		expect((await memberRows('fam-full')).map((row) => row.userId)).not.toContain(out.id);
	});

	it('the next roster read and the use count both reflect the new member', async () => {
		const { ann } = await seedRoster();
		const joiner = await seedUser(testDb(), { firstName: 'Joiner', lastName: 'Nine' });
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-1', useCount: 2, maxUses: 5 });

		const res = await join(joiner, { code: 'LIVE000001' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });

		const [row] = (await memberRows('fam-1')).filter((member) => member.userId === joiner.id);
		expect([row.role, row.memberType]).toEqual(['member', 'member']);
		const [invite] = await testDb()
			.select()
			.from(familyInviteCodes)
			.where(eq(familyInviteCodes.code, 'LIVE000001'));
		expect(invite.useCount).toBe(3);

		const roster = await invoke(getRoster, {
			ctx: ctx(),
			user: joiner,
			path: '/api/family/roster?familyId=fam-1'
		});
		const members = bodyOf<{ members: { userId: string }[] }>(roster).members;
		expect(members.map((member) => member.userId)).toContain(joiner.id);
		expect(members.map((member) => member.userId)).toContain(ann.id);
	});
});

describe('GET /api/family/member-search', () => {
	it('answers 401 Unauthorized when signed out', async () => {
		const res = await invoke(memberSearch, {
			ctx: ctx(),
			path: '/api/family/member-search?q=an'
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('refuses a missing, one-character or blank term before any query', async () => {
		const user = await seedUser(testDb());
		const cases: [string, string][] = [
			['/api/family/member-search', '10.0.0.21'],
			['/api/family/member-search?q=a', '10.0.0.22'],
			['/api/family/member-search?q=%20%20%20', '10.0.0.23']
		];
		for (const [path, ip] of cases) {
			const res = await invoke(memberSearch, {
				ctx: ctx(),
				user,
				path,
				headers: { 'x-real-ip': ip }
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Type at least 2 characters to look someone up.' });
		}
	});

	it('refuses an over-long term before any query', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(memberSearch, {
			ctx: ctx(),
			user,
			path: `/api/family/member-search?q=${'a'.repeat(61)}`,
			headers: { 'x-real-ip': '10.0.0.41' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'That search is too long.' });
	});

	it('answers 429 after twenty searches from the same IP', async () => {
		const user = await seedUser(testDb());
		for (let i = 0; i < 20; i += 1) {
			const res = await invoke(memberSearch, {
				ctx: ctx(),
				user,
				path: '/api/family/member-search?q=an',
				headers: { 'x-real-ip': '10.0.0.42' }
			});
			expect(res.status).toBe(200);
		}
		const limited = await invoke(memberSearch, {
			ctx: ctx(),
			user,
			path: '/api/family/member-search?q=an',
			headers: { 'x-real-ip': '10.0.0.42' }
		});
		expect(limited.status).toBe(429);
		expect(limited.body).toEqual({ error: 'Too many searches. Try again shortly.' });
	});

	it('matches verified prefixes, masks the email and keeps the caller out', async () => {
		const caller = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Caller' });
		const target = await seedUser(testDb(), {
			firstName: 'Anna',
			lastName: 'Smith',
			email: 'anna.smith@example.test'
		});
		await seedUser(testDb(), {
			firstName: 'Anna',
			lastName: 'Hidden',
			email: 'anna.hidden@example.test',
			emailVerified: false
		});

		const res = await invoke(memberSearch, {
			ctx: ctx(),
			user: caller,
			path: '/api/family/member-search?q=an',
			headers: { 'x-real-ip': '10.0.0.43' }
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			users: [
				{
					id: target.id,
					firstName: 'Anna',
					lastName: 'Smith',
					email: 'a••••••@e••••••'
				}
			]
		});
		expect(res.text).not.toContain('anna.smith@example.test');
	});

	it('matches the last name and email prefixes case-insensitively', async () => {
		const caller = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Caller' });
		const target = await seedUser(testDb(), {
			firstName: 'Anna',
			lastName: 'Smith',
			email: 'anna.smith@example.test'
		});
		for (const term of ['SMI', 'ANNA.S']) {
			const res = await invoke(memberSearch, {
				ctx: ctx(),
				user: caller,
				path: `/api/family/member-search?q=${term}`,
				headers: { 'x-real-ip': '10.0.0.35' }
			});
			expect(bodyOf<{ users: { id: string }[] }>(res).users.map((user) => user.id)).toEqual([
				target.id
			]);
		}
	});

	it('removes every excluded id', async () => {
		const caller = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Caller' });
		const target = await seedUser(testDb(), { firstName: 'Anna', lastName: 'Smith' });
		const res = await invoke(memberSearch, {
			ctx: ctx(),
			user: caller,
			path: `/api/family/member-search?q=an&exclude=${target.id}`,
			headers: { 'x-real-ip': '10.0.0.46' }
		});
		expect(res.body).toEqual({ users: [] });
	});

	it('caps the result at ten rows', async () => {
		const caller = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Caller' });
		const ids: string[] = [];
		for (let i = 0; i < 12; i += 1) {
			const user = await seedUser(testDb(), { firstName: `Zed${i}`, lastName: 'Stone' });
			ids.push(user.id);
		}
		const res = await invoke(memberSearch, {
			ctx: ctx(),
			user: caller,
			path: '/api/family/member-search?q=zed',
			headers: { 'x-real-ip': '10.0.0.47' }
		});
		const users = bodyOf<{ users: { id: string }[] }>(res).users;
		expect(users).toHaveLength(10);
		expect(users.every((user) => ids.includes(user.id))).toBe(true);
	});

	it('escapes ILIKE wildcards so they cannot become a scan', async () => {
		const caller = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Caller' });
		for (let i = 0; i < 3; i += 1) {
			await seedUser(testDb(), { firstName: 'Zed', lastName: 'Stone' });
		}
		const res = await invoke(memberSearch, {
			ctx: ctx(),
			user: caller,
			path: '/api/family/member-search?q=%%',
			headers: { 'x-real-ip': '10.0.0.48' }
		});
		expect(res.body).toEqual({ users: [] });
	});

	it('answers empty when only unverified accounts match', async () => {
		const caller = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Caller' });
		await seedUser(testDb(), {
			firstName: 'Anna',
			lastName: 'Unverified',
			emailVerified: false
		});
		const res = await invoke(memberSearch, {
			ctx: ctx(),
			user: caller,
			path: '/api/family/member-search?q=an',
			headers: { 'x-real-ip': '10.0.0.49' }
		});
		expect(res.body).toEqual({ users: [] });
	});
});

describe('GET /api/family/roster', () => {
	it('answers 401 Unauthorized when signed out', async () => {
		const res = await invoke(getRoster, { ctx: ctx(), path: '/api/family/roster' });
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers familyId null and no members when you have no family', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(getRoster, { ctx: ctx(), user, path: '/api/family/roster' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ familyId: null, members: [] });
	});

	it('defaults to your family', async () => {
		const ann = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Rivera' });
		await seedFamily('fam-1');
		await seedMembership('fam-1', ann.id, 'creator', 'parent');
		const res = await invoke(getRoster, { ctx: ctx(), user: ann, path: '/api/family/roster' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			familyId: 'fam-1',
			members: [
				{
					userId: ann.id,
					firstName: 'Ann',
					lastName: 'Rivera',
					email: ann.email,
					role: 'creator',
					memberType: 'parent'
				}
			]
		});
	});

	it('reads one named family and refuses someone else\'s', async () => {
		const { ann, bob, cid, dee, out } = await seedRoster();
		const res = await invoke(getRoster, {
			ctx: ctx(),
			user: bob,
			path: '/api/family/roster?familyId=fam-1'
		});
		const body = bodyOf<{ familyId: string; members: { userId: string }[] }>(res);
		const byUser = (a: { userId: string }, b: { userId: string }) =>
			a.userId.localeCompare(b.userId);
		expect(body.familyId).toBe('fam-1');
		expect([...body.members].sort(byUser)).toEqual(
			[
				{ userId: ann.id, firstName: 'Ann', lastName: 'Rivera', email: ann.email, role: 'creator', memberType: 'parent' },
				{ userId: bob.id, firstName: 'Bob', lastName: 'Stone', email: bob.email, role: 'admin', memberType: 'parent' },
				{ userId: cid.id, firstName: 'Cid', lastName: 'Vale', email: cid.email, role: 'member', memberType: 'member' },
				{ userId: dee.id, firstName: 'Dee', lastName: 'Wren', email: dee.email, role: 'member', memberType: 'member' }
			].sort(byUser)
		);

		const stranger = await invoke(getRoster, {
			ctx: ctx(),
			user: out,
			path: '/api/family/roster?familyId=fam-1'
		});
		expect(stranger.status).toBe(403);
		expect(stranger.body).toEqual({ error: 'Not a member of this family' });
	});
});

describe('GET /api/family/search', () => {
	it('answers 401 Unauthorized when signed out', async () => {
		const res = await invoke(searchFamily, {
			ctx: ctx(),
			path: '/api/family/search?q=ann&familyId=fam-1'
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers an empty list when q or familyId is missing', async () => {
		const user = await seedUser(testDb());
		const noQuery = await invoke(searchFamily, {
			ctx: ctx(),
			user,
			path: '/api/family/search?familyId=fam-1'
		});
		expect(noQuery.status).toBe(200);
		expect(noQuery.body).toEqual({ users: [] });

		const noFamily = await invoke(searchFamily, {
			ctx: ctx(),
			user,
			path: '/api/family/search?q=ann'
		});
		expect(noFamily.status).toBe(200);
		expect(noFamily.body).toEqual({ users: [] });
	});

	it('answers 403 for a family you are not in, even when you belong to another', async () => {
		const { out } = await seedRoster();
		await seedFamily('fam-2');
		await seedMembership('fam-2', out.id, 'creator');
		const res = await invoke(searchFamily, {
			ctx: ctx(),
			user: out,
			path: '/api/family/search?q=ann&familyId=fam-1'
		});
		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'You do not have permission to search in this family' });
	});

	it('matches an exact email only, excluding members, unverified accounts and substrings', async () => {
		const { ann, cid } = await seedRoster();
		const target = await seedUser(testDb(), {
			firstName: 'Bob',
			lastName: 'Stone',
			email: 'bob.stone@example.test'
		});
		await seedUser(testDb(), {
			firstName: 'Bob',
			lastName: 'Unverified',
			email: 'bob.unverified@example.test',
			emailVerified: false
		});

		const exact = await invoke(searchFamily, {
			ctx: ctx(),
			user: ann,
			path: '/api/family/search?q=bob.stone@example.test&familyId=fam-1'
		});
		expect(exact.status).toBe(200);
		expect(exact.body).toEqual({
			users: [
				{
					id: target.id,
					firstName: 'Bob',
					lastName: 'Stone',
					email: 'bob.stone@example.test'
				}
			]
		});

		// A substring, an unverified account, and an address that belongs to a member.
		const terms = ['bob.stone', 'bob.unverified@example.test', cid.email ?? ''];
		for (const term of terms) {
			const res = await invoke(searchFamily, {
				ctx: ctx(),
				user: ann,
				path: `/api/family/search?q=${encodeURIComponent(term)}&familyId=fam-1`
			});
			expect(res.status).toBe(200);
			expect(res.body).toEqual({ users: [] });
		}
	});

	it('does not find a full name: both name columns are compared to the whole query', async () => {
		const { ann } = await seedRoster();
		await seedUser(testDb(), { firstName: 'Ann', lastName: 'Lee', email: 'ann.lee@example.test' });
		const sameBoth = await seedUser(testDb(), {
			firstName: 'Sam',
			lastName: 'Sam',
			email: 'sam.sam@example.test'
		});

		const fullName = await invoke(searchFamily, {
			ctx: ctx(),
			user: ann,
			path: `/api/family/search?q=${encodeURIComponent('Ann Lee')}&familyId=fam-1`
		});
		expect(fullName.status).toBe(200);
		expect(fullName.body).toEqual({ users: [] });

		// The only name query that can match is one token equal to BOTH columns.
		const identical = await invoke(searchFamily, {
			ctx: ctx(),
			user: ann,
			path: '/api/family/search?q=Sam&familyId=fam-1'
		});
		expect(bodyOf<{ users: { id: string }[] }>(identical).users.map((user) => user.id)).toEqual([
			sameBoth.id
		]);
	});

	it('caps the name match at ten rows and escapes wildcards', async () => {
		const { ann } = await seedRoster();
		for (let i = 0; i < 12; i += 1) {
			await seedUser(testDb(), { firstName: 'Same', lastName: 'Same' });
		}
		const capped = await invoke(searchFamily, {
			ctx: ctx(),
			user: ann,
			path: '/api/family/search?q=Same&familyId=fam-1'
		});
		expect(bodyOf<{ users: unknown[] }>(capped).users).toHaveLength(10);

		const wildcard = await invoke(searchFamily, {
			ctx: ctx(),
			user: ann,
			path: '/api/family/search?q=%25%25&familyId=fam-1'
		});
		expect(wildcard.body).toEqual({ users: [] });
	});
});

describe('POST /api/families/{id}/members/direct', () => {
	const add = async (actor: SeededUser, familyId: string, body: JsonValue) =>
		invoke(addDirect, {
			ctx: ctx(),
			user: actor,
			method: 'POST',
			params: { id: familyId },
			path: `/api/families/${familyId}/members/direct`,
			body
		});

	it('answers 401 Unauthorized when signed out', async () => {
		const res = await invoke(addDirect, {
			ctx: ctx(),
			method: 'POST',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1/members/direct',
			body: { userId: 'u2' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers User ID is required and Family ID is required', async () => {
		const { bob } = await seedRoster();
		expect(await add(bob, 'fam-1', {})).toMatchObject({
			status: 400,
			body: { error: 'User ID is required' }
		});
		expect(await add(bob, 'fam-1', { userId: '' })).toMatchObject({
			status: 400,
			body: { error: 'User ID is required' }
		});
		expect(await add(bob, '', { userId: bob.id })).toMatchObject({
			status: 400,
			body: { error: 'Family ID is required' }
		});
	});

	it('refuses a non-member and a plain member', async () => {
		const { cid, dee, out } = await seedRoster();
		const stranger = await add(out, 'fam-1', { userId: dee.id });
		expect(stranger.status).toBe(403);
		expect(stranger.body).toEqual({ error: 'You are not a member of this family' });

		const plain = await add(cid, 'fam-1', { userId: out.id });
		expect(plain.status).toBe(403);
		expect(plain.body).toEqual({
			error: 'Only the family creator or an admin can add members directly'
		});
	});

	it('answers 404 for an unknown user and 400 for an existing member', async () => {
		const { bob, cid } = await seedRoster();
		const missing = await add(bob, 'fam-1', { userId: 'ghost' });
		expect(missing.status).toBe(404);
		expect(missing.body).toEqual({ error: 'User not found' });

		const existing = await add(bob, 'fam-1', { userId: cid.id });
		expect(existing.status).toBe(400);
		expect(existing.body).toEqual({ error: 'User is already a member of this family' });
	});

	it('answers 403 family full with the plan reason', async () => {
		const { bob, out } = await seedFullFamily();
		const res = await add(bob, 'fam-full', { userId: out.id });
		expect(res.status).toBe(403);
		expect(res.body).toEqual({
			error: 'Family is full (6 member limit). Upgrade to add more members.'
		});
	});

	it('adds the member and writes an added_to_family Alert', async () => {
		const { bob, out } = await seedRoster();
		const res = await add(bob, 'fam-1', { userId: out.id });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });

		const [member] = (await memberRows('fam-1')).filter((row) => row.userId === out.id);
		expect([member.role, member.memberType]).toEqual(['member', 'member']);

		const alerts = await testDb()
			.select()
			.from(notifications)
			.where(eq(notifications.userId, out.id));
		expect(alerts).toEqual([
			expect.objectContaining({
				type: 'added_to_family',
				actorName: 'Bob Stone',
				message: 'Bob Stone added you to the family.',
				link: '/family/fam-1',
				readAt: null
			})
		]);
	});
});

describe('POST /api/families/{id}/members/child', () => {
	const add = async (actor: SeededUser, familyId: string, body: JsonValue) =>
		invoke(addChild, {
			ctx: ctx(),
			user: actor,
			method: 'POST',
			params: { id: familyId },
			path: `/api/families/${familyId}/members/child`,
			body
		});

	const valid = {
		firstName: 'Mia',
		lastName: 'Nakamura',
		email: 'mia@kids.example.test',
		consentAcknowledged: true
	};

	it('answers 401 Unauthorized when signed out', async () => {
		const res = await invoke(addChild, {
			ctx: ctx(),
			method: 'POST',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1/members/child',
			body: valid
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('answers Family ID is required for an empty path id', async () => {
		const { bob } = await seedRoster();
		const res = await add(bob, '', valid);
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Family ID is required' });
	});

	it('refuses a non-member and a plain member', async () => {
		const { cid, out } = await seedRoster();
		const stranger = await add(out, 'fam-1', valid);
		expect(stranger.status).toBe(403);
		expect(stranger.body).toEqual({ error: 'You are not a member of this family' });

		const plain = await add(cid, 'fam-1', valid);
		expect(plain.status).toBe(403);
		expect(plain.body).toEqual({
			error: 'Only the family creator or an admin can add members'
		});
	});

	it('answers 403 family full before it reads the body', async () => {
		const { bob } = await seedFullFamily();
		const res = await add(bob, 'fam-full', {});
		expect(res.status).toBe(403);
		expect(res.body).toEqual({
			error: 'Family is full (6 member limit). Upgrade to add more members.'
		});
	});

	it('validates the name fields and the email address', async () => {
		const { bob } = await seedRoster();
		const cases: [JsonValue, string][] = [
			[{ ...valid, firstName: '' }, 'First name is required'],
			[{ ...valid, firstName: '   ' }, 'First name is required'],
			[{ ...valid, lastName: '' }, 'Last name is required'],
			[{ ...valid, email: 'nope' }, 'A valid email is required'],
			[{ ...valid, email: 'nope@x' }, 'A valid email is required']
		];
		for (const [body, error] of cases) {
			const res = await add(bob, 'fam-1', body);
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error });
		}
	});

	it('refuses an email another account already uses', async () => {
		const { bob } = await seedRoster();
		await seedUser(testDb(), { email: 'taken@example.test' });
		const res = await add(bob, 'fam-1', { ...valid, email: 'TAKEN@example.test' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({
			error: 'That email is already in use. Each child needs their own email address.'
		});
	});

	it('requires an explicit consent acknowledgment', async () => {
		const { bob } = await seedRoster();
		const missing = await add(bob, 'fam-1', {
			firstName: 'Mia',
			lastName: 'Nakamura',
			email: 'mia@kids.example.test'
		});
		expect(missing.status).toBe(400);
		expect(missing.body).toEqual({
			error:
				'Please confirm you are this child’s parent or guardian and consent to creating their account.'
		});

		const refused = await add(bob, 'fam-1', { ...valid, consentAcknowledged: false });
		expect(refused.status).toBe(400);
		expect(refused.body).toEqual({
			error:
				'Please confirm you are this child’s parent or guardian and consent to creating their account.'
		});
	});

	it('creates a verified child account, a child membership and an append-only consent record', async () => {
		const { bob } = await seedRoster();
		const res = await add(bob, 'fam-1', {
			firstName: ' Mia ',
			lastName: ' Nakamura ',
			email: 'Mia@Kids.Example.Test',
			consentAcknowledged: true
		});
		expect(res.status).toBe(200);
		const body = bodyOf<{
			success: boolean;
			user: { id: string; firstName: string; lastName: string; email: string };
		}>(res);
		expect(body).toEqual({
			success: true,
			user: {
				id: expect.any(String),
				firstName: 'Mia',
				lastName: 'Nakamura',
				email: 'mia@kids.example.test'
			}
		});

		const [member] = (await memberRows('fam-1')).filter(
			(row) => row.userId === body.user.id
		);
		expect([member.role, member.memberType]).toEqual(['member', 'child']);

		const consents = await testDb()
			.select()
			.from(childConsentRecords)
			.where(eq(childConsentRecords.childUserId, body.user.id));
		expect(consents).toEqual([
			expect.objectContaining({
				childUserId: body.user.id,
				parentUserId: bob.id,
				familyId: 'fam-1',
				source: 'child-create'
			})
		]);

		const accountRows = await testDb()
			.select()
			.from(accounts)
			.where(eq(accounts.userId, body.user.id));
		expect(accountRows.map((row) => [row.provider, row.providerAccountId])).toEqual([
			['email', 'mia@kids.example.test']
		]);
		const settingsRows = await testDb()
			.select()
			.from(userSettings)
			.where(eq(userSettings.userId, body.user.id));
		expect(settingsRows).toHaveLength(1);
		const calendarRows = await testDb()
			.select()
			.from(calendars)
			.where(eq(calendars.ownerId, body.user.id));
		expect(calendarRows).toHaveLength(1);
	});
});

describe('POST /api/families/{id}/members/email/link', () => {
	const mint = async (actor: SeededUser, familyId: string, body: JsonValue, ip: string) =>
		invoke(mintInviteLink, {
			ctx: ctx(),
			user: actor,
			method: 'POST',
			params: { id: familyId },
			path: `/api/families/${familyId}/members/email/link`,
			body,
			headers: { 'x-real-ip': ip }
		});

	const valid = { email: 'guest@example.test', firstName: 'Guest', lastName: 'User' };

	it('answers 401 Unauthorized when signed out', async () => {
		const res = await invoke(mintInviteLink, {
			ctx: ctx(),
			method: 'POST',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1/members/email/link',
			body: valid,
			headers: { 'x-real-ip': '10.1.0.1' }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('refuses a non-member and a plain member', async () => {
		const { cid, out } = await seedRoster();
		const stranger = await invoke(mintInviteLink, {
			ctx: ctx(),
			user: out,
			method: 'POST',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1/members/email/link',
			body: valid,
			headers: { 'x-real-ip': '10.1.0.2' }
		});
		expect(stranger.status).toBe(403);
		expect(stranger.body).toEqual({ error: 'Not a member of this family' });

		const plain = await invoke(mintInviteLink, {
			ctx: ctx(),
			user: cid,
			method: 'POST',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1/members/email/link',
			body: valid,
			headers: { 'x-real-ip': '10.1.0.3' }
		});
		expect(plain.status).toBe(403);
		expect(plain.body).toEqual({
			error: 'Only the family creator or an admin can generate invite links'
		});
	});

	it('validates the email and the names with success:false bodies', async () => {
		const { ann } = await seedRoster();
		const badEmail = await mint(ann, 'fam-1', { ...valid, email: 'not-an-email' }, '10.1.0.4');
		expect(badEmail.status).toBe(400);
		expect(badEmail.body).toEqual({ success: false, error: 'Invalid email' });

		const badNames = await mint(ann, 'fam-1', { ...valid, firstName: '' }, '10.1.0.4');
		expect(badNames.status).toBe(400);
		expect(badNames.body).toEqual({
			success: false,
			error: 'First and last name are required'
		});
	});

	it('mints a 10-use, 1-day code and returns the token link', async () => {
		const { ann } = await seedRoster();
		const res = await mint(ann, 'fam-1', valid, '10.1.0.8');
		expect(res.status).toBe(200);
		const body = bodyOf<{ success: boolean; link: string }>(res);
		expect(body.success).toBe(true);
		expect(body.link).toMatch(/\/family\/invite\/email\?token=\S+$/);

		const rows = await inviteRows('fam-1');
		expect(rows).toHaveLength(1);
		expect([rows[0].maxUses, rows[0].useCount, rows[0].createdBy]).toEqual([10, 0, ann.id]);

		const defaultInvite = await invoke(mintInvite, {
			ctx: ctx(),
			user: ann,
			method: 'POST',
			path: '/api/family/invite',
			body: { familyId: 'fam-1' }
		});
		const defaultExpiry = bodyOf<{ expiresAt: string }>(defaultInvite).expiresAt;
		expect(daysBetween(rows[0].expiresAt.toISOString(), defaultExpiry)).toBeGreaterThan(5.9);
		expect(daysBetween(rows[0].expiresAt.toISOString(), defaultExpiry)).toBeLessThan(6.1);
	});

	it('answers 429 after ten mints from one IP, before the membership check', async () => {
		const { ann } = await seedRoster();
		for (let i = 0; i < 10; i += 1) {
			const res = await invoke(mintInviteLink, {
				ctx: ctx(),
				user: ann,
				method: 'POST',
				params: { id: 'fam-1' },
				path: '/api/families/fam-1/members/email/link',
				body: valid,
				headers: { 'x-real-ip': '10.1.0.9' }
			});
			expect(res.status).toBe(200);
		}
		const limited = await invoke(mintInviteLink, {
			ctx: ctx(),
			user: ann,
			method: 'POST',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1/members/email/link',
			body: valid,
			headers: { 'x-real-ip': '10.1.0.9' }
		});
		expect(limited.status).toBe(429);
		expect(limited.body).toEqual({ error: 'Too many requests. Try again later.' });
		expect(await inviteRows('fam-1')).toHaveLength(10);
	});

	it('counts a non-member toward the same limit, proving the check runs first', async () => {
		const { out } = await seedRoster();
		for (let i = 0; i < 10; i += 1) {
			const res = await invoke(mintInviteLink, {
				ctx: ctx(),
				user: out,
				method: 'POST',
				params: { id: 'fam-1' },
				path: '/api/families/fam-1/members/email/link',
				body: valid,
				headers: { 'x-real-ip': '10.1.0.10' }
			});
			expect(res.status).toBe(403);
		}
		const limited = await invoke(mintInviteLink, {
			ctx: ctx(),
			user: out,
			method: 'POST',
			params: { id: 'fam-1' },
			path: '/api/families/fam-1/members/email/link',
			body: valid,
			headers: { 'x-real-ip': '10.1.0.10' }
		});
		expect(limited.status).toBe(429);
	});
});

// golden from spec: legacy handler not runnable here (imports `$env/static/private` and sends email through Resend).
// Written from docs/guides/task-api-spec.md (G10e) and the legacy route test
// src/routes/(family)/family/[familyId]/members/add/email/server.test.ts.
// Unskip at S6: family S5 adds the kernel `mail` port, so testCtx can hand the
// handler a fake and the success case can assert the minted row without mail.
describe.skip('POST /api/families/{id}/members/email (golden from spec)', () => {
	const invokeSend = async (actor: SeededUser | null, familyId: string, body: JsonValue, ip: string) => {
		// Loaded lazily, not imported at the top: a static import evaluates the
		// legacy module (and its env/Resend imports) while this file loads, which
		// would break every other suite in it.
		const { POST } = await import(
			'../../../routes/api/families/[id]/members/email/+server'
		);
		return invoke(POST, {
			ctx: ctx(),
			...(actor ? { user: actor } : {}),
			method: 'POST',
			params: { id: familyId },
			path: `/api/families/${familyId}/members/email`,
			body,
			headers: { 'x-real-ip': ip }
		});
	};

	const valid = { email: 'guest@example.test', firstName: 'Guest', lastName: 'User' };

	it('answers 401 Unauthorized when signed out', async () => {
		const res = await invokeSend(null, 'fam-1', valid, '10.2.0.1');
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});

	it('refuses a non-member and a plain member', async () => {
		const { cid, out } = await seedRoster();
		const stranger = await invokeSend(out, 'fam-1', valid, '10.2.0.2');
		expect(stranger.status).toBe(403);
		expect(stranger.body).toEqual({ error: 'Not a member of this family' });

		const plain = await invokeSend(cid, 'fam-1', valid, '10.2.0.3');
		expect(plain.status).toBe(403);
		expect(plain.body).toEqual({
			error: 'Only the family creator or an admin can send invitations'
		});
	});

	it('validates the email and the names with success:false bodies', async () => {
		const { ann } = await seedRoster();
		const badEmail = await invokeSend(ann, 'fam-1', { ...valid, email: 'not-an-email' }, '10.2.0.4');
		expect(badEmail.status).toBe(400);
		expect(badEmail.body).toEqual({ success: false, error: 'Invalid email' });

		const badNames = await invokeSend(ann, 'fam-1', { ...valid, lastName: '' }, '10.2.0.5');
		expect(badNames.status).toBe(400);
		expect(badNames.body).toEqual({
			success: false,
			error: 'First and last name are required'
		});
	});

	it('answers 429 after ten sends from one IP', async () => {
		const { ann } = await seedRoster();
		for (let i = 0; i < 10; i += 1) {
			const res = await invokeSend(ann, 'fam-1', { ...valid, email: 'bad' }, '10.2.0.6');
			expect(res.status).toBe(400);
		}
		const limited = await invokeSend(ann, 'fam-1', valid, '10.2.0.6');
		expect(limited.status).toBe(429);
		expect(limited.body).toEqual({ error: 'Too many requests. Try again later.' });
	});

	it('mints one single-use, 1-day code and answers {success:true}', async () => {
		const { ann } = await seedRoster();
		const res = await invokeSend(ann, 'fam-1', valid, '10.2.0.7');
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = await inviteRows('fam-1');
		expect(rows).toHaveLength(1);
		expect([rows[0].maxUses, rows[0].useCount, rows[0].createdBy]).toEqual([1, 0, ann.id]);
		const defaultInvite = await invoke(mintInvite, {
			ctx: ctx(),
			user: ann,
			method: 'POST',
			path: '/api/family/invite',
			body: { familyId: 'fam-1' }
		});
		const defaultExpiry = bodyOf<{ expiresAt: string }>(defaultInvite).expiresAt;
		expect(daysBetween(rows[0].expiresAt.toISOString(), defaultExpiry)).toBeGreaterThan(5.9);
		expect(daysBetween(rows[0].expiresAt.toISOString(), defaultExpiry)).toBeLessThan(6.1);
	});
});
