/**
 * family members services against real Postgres: one test per IO Invariant,
 * titled after the rule. Each runs in `rollbackTest`; the five ports are memory
 * fakes, so a test asserts exactly what crossed the boundary (R9) and never
 * reaches legacy code.
 *
 * Expected copy and order come from `src/routes/(family)/family/[familyId]/
 * members/add/**` and `src/lib/server/services/familyData.ts`, and the frozen
 * golden pins the same sentences on the wire.
 *
 * Doc: ./README.md#how-to-test
 */
import { asc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import {
	childConsentRecords,
	familyInviteCodes,
	familyMembers,
	notifications
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamilyRoster, seedFullFamily } from './family.fixtures.server';
import {
	addChildMember,
	addMemberDirectly,
	changeMember,
	mintFamilyInviteLink,
	removeFamilyMember,
	sendFamilyInvite
} from './family.members.service.server';
import type {
	FamilyChildAccountInput,
	FamilyCtx,
	FamilyInviteLinkInput,
	FamilyPorts
} from './index.server';

const NOW = '2026-03-01T09:00:00.000Z';

/** What the fakes recorded across one test. */
type PortCalls = {
	readonly tasks: [string, string][];
	readonly child: FamilyChildAccountInput[];
	readonly links: FamilyInviteLinkInput[];
};

function calls(): PortCalls {
	return { tasks: [], child: [], links: [] };
}

/** Memory ports; the child fake inserts a real user row so the membership's FK holds. */
function familyPorts(db: Db, recorded: PortCalls): FamilyPorts {
	return {
		calendar: {
			createFamilyCalendar: async () => {
				throw new Error('family creation is not part of these use-cases');
			}
		},
		tasks: {
			unassignMemberTasks: async (_ctx, familyId, userId) => {
				recorded.tasks.push([familyId, userId]);
			}
		},
		moduleSwitches: {
			listFamilyModuleSwitches: async () => {
				throw new Error('the detail payload is not part of these use-cases');
			}
		},
		childAccount: {
			createChildAccount: async (_ctx, input) => {
				recorded.child.push(input);
				const user = await seedUser(db, input);
				return {
					id: user.id,
					firstName: user.firstName,
					lastName: user.lastName,
					email: user.email
				};
			}
		},
		inviteLink: {
			mintInviteLink: async (input) => {
				recorded.links.push(input);
				return `https://test.familyplanz.com/family/invite/email?token=${input.inviteCode}`;
			}
		}
	};
}

function memberCtx(db: Db, recorded: PortCalls = calls()) {
	return { ...testCtx({ db, now: NOW }), ...familyPorts(db, recorded) };
}

describe('addMemberDirectly', () => {
	rollbackTest('adds the member and writes the added_to_family Alert to them', async (db) => {
		const { bob, out } = await seedFamilyRoster(db);
		await addMemberDirectly(memberCtx(db), actorFromUser(bob, 'session'), {
			familyId: 'fam-1',
			userId: out.id
		});

		const [member] = await db
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, out.id));
		expect([member.role, member.memberType]).toEqual(['member', 'member']);
		const alerts = await db.select().from(notifications).where(eq(notifications.userId, out.id));
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

	rollbackTest('refuses a plain member with the direct door copy and writes nothing', async (db) => {
		const { cid, out } = await seedFamilyRoster(db);
		const failure = await addMemberDirectly(memberCtx(db), actorFromUser(cid, 'session'), {
			familyId: 'fam-1',
			userId: out.id
		}).catch((error: unknown) => error);
		expect(failure).toMatchObject({
			status: 403,
			message: 'Only the family creator or an admin can add members directly'
		});
		expect(await db.select().from(familyMembers).where(eq(familyMembers.userId, out.id))).toEqual([]);
	});

	rollbackTest('answers Unknown user, already a member and the family-size refusal', async (db) => {
		const { bob, cid } = await seedFamilyRoster(db);
		const ctx = memberCtx(db);
		const actor = actorFromUser(bob, 'session');

		const missing = await addMemberDirectly(ctx, actor, { familyId: 'fam-1', userId: 'ghost' }).catch(
			(error: unknown) => error
		);
		expect(missing).toMatchObject({ status: 404, message: 'User not found' });

		const existing = await addMemberDirectly(ctx, actor, { familyId: 'fam-1', userId: cid.id }).catch(
			(error: unknown) => error
		);
		expect(existing).toMatchObject({ status: 400, message: 'User is already a member of this family' });

		const full = await seedFullFamily(db);
		const fullFailure = await addMemberDirectly(ctx, actorFromUser(full.bob, 'session'), {
			familyId: 'fam-full',
			userId: full.out.id
		}).catch((error: unknown) => error);
		expect(fullFailure).toMatchObject({
			status: 403,
			message: 'Family is full (6 member limit). Upgrade to add more members.'
		});
	});
});

describe('addChildMember', () => {
	rollbackTest('creates the child through the port, a child membership and an append-only consent record', async (db) => {
		const { bob } = await seedFamilyRoster(db);
		const recorded = calls();

		const child = await addChildMember(memberCtx(db, recorded), actorFromUser(bob, 'session'), {
			familyId: 'fam-1',
			firstName: ' Mia ',
			lastName: ' Nakamura ',
			email: 'Mia@Kids.Example.Test',
			consentAcknowledged: true
		});

		expect(recorded.child).toEqual([
			{ firstName: 'Mia', lastName: 'Nakamura', email: 'mia@kids.example.test' }
		]);
		const [member] = await db
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, child.id));
		expect([member.role, member.memberType]).toEqual(['member', 'child']);
		const consents = await db
			.select()
			.from(childConsentRecords)
			.where(eq(childConsentRecords.childUserId, child.id));
		expect(consents.map((row) => [row.parentUserId, row.familyId, row.source])).toEqual([
			[bob.id, 'fam-1', 'child-create']
		]);
	});

	rollbackTest('refuses without an explicit consent and creates nothing', async (db) => {
		const { bob } = await seedFamilyRoster(db);
		const recorded = calls();
		const failure = await addChildMember(memberCtx(db, recorded), actorFromUser(bob, 'session'), {
			familyId: 'fam-1',
			firstName: 'Mia',
			lastName: 'Nakamura',
			email: 'mia@kids.example.test',
			consentAcknowledged: false
		}).catch((error: unknown) => error);

		expect(failure).toMatchObject({
			status: 400,
			message:
				'Please confirm you are this child’s parent or guardian and consent to creating their account.'
		});
		expect(recorded.child).toEqual([]);
	});

	rollbackTest('refuses an email another account already uses', async (db) => {
		const { bob } = await seedFamilyRoster(db);
		await seedUser(db, { email: 'taken@example.test' });
		const recorded = calls();
		const failure = await addChildMember(memberCtx(db, recorded), actorFromUser(bob, 'session'), {
			familyId: 'fam-1',
			firstName: 'Mia',
			lastName: 'Nakamura',
			email: 'TAKEN@example.test',
			consentAcknowledged: true
		}).catch((error: unknown) => error);

		expect(failure).toMatchObject({
			status: 400,
			message: 'That email is already in use. Each child needs their own email address.'
		});
		expect(recorded.child).toEqual([]);
	});

	rollbackTest('checks the family size before it reads the form', async (db) => {
		const { bob } = await seedFullFamily(db);
		const recorded = calls();
		const failure = await addChildMember(memberCtx(db, recorded), actorFromUser(bob, 'session'), {
			familyId: 'fam-full',
			firstName: '',
			lastName: '',
			email: '',
			consentAcknowledged: false
		}).catch((error: unknown) => error);

		expect(failure).toMatchObject({
			status: 403,
			message: 'Family is full (6 member limit). Upgrade to add more members.'
		});
		expect(recorded.child).toEqual([]);
	});
});

describe('sendFamilyInvite', () => {
	rollbackTest('mints a single-use one-day code and emails the code-bound link', async (db) => {
		const { ann } = await seedFamilyRoster(db);
		const recorded = calls();
		const ctx = memberCtx(db, recorded);

		const answer = await sendFamilyInvite(ctx, actorFromUser(ann, 'session'), {
			familyId: 'fam-1',
			email: 'guest@example.test',
			firstName: 'Guest',
			lastName: 'User'
		});

		expect(answer).toEqual({ delivered: true });
		const [row] = await db.select().from(familyInviteCodes);
		expect([row.maxUses, row.useCount, row.createdBy]).toEqual([1, 0, ann.id]);
		expect(row.expiresAt.getTime() - Date.parse(NOW)).toBe(86_400_000);
		// The signed link embeds the durable code row (#152).
		expect(recorded.links).toEqual([
			{
				email: 'guest@example.test',
				firstName: 'Guest',
				lastName: 'User',
				familyId: 'fam-1',
				inviteCode: row.code
			}
		]);
		expect(ctx.mail.outbox).toEqual([
			expect.objectContaining({
				to: 'guest@example.test',
				from: 'noReply@familyplanz.com',
				subject: 'You have been invited to join a family by Ann Rivera'
			})
		]);
		expect(ctx.mail.outbox[0].html).toContain(`token=${row.code}`);
	});

	rollbackTest('answers delivered:false when the provider refuses, leaving the minted row', async (db) => {
		const { ann } = await seedFamilyRoster(db);
		const recorded = calls();
		const base = memberCtx(db, recorded);
		const ctx: FamilyCtx = {
			...base,
			mail: {
				send: async () => {
					throw new Error('smtp is down');
				}
			}
		};

		const answer = await sendFamilyInvite(ctx, actorFromUser(ann, 'session'), {
			familyId: 'fam-1',
			email: 'guest@example.test',
			firstName: 'Guest',
			lastName: 'User'
		});

		expect(answer).toEqual({ delivered: false });
		expect(await db.select().from(familyInviteCodes)).toHaveLength(1);
	});

	rollbackTest("refuses a plain member with the email door's own copy", async (db) => {
		const { cid } = await seedFamilyRoster(db);
		const failure = await sendFamilyInvite(memberCtx(db), actorFromUser(cid, 'session'), {
			familyId: 'fam-1',
			email: 'guest@example.test',
			firstName: 'Guest',
			lastName: 'User'
		}).catch((error: unknown) => error);
		expect(failure).toMatchObject({
			status: 403,
			message: 'Only the family creator or an admin can send invitations'
		});
	});

	rollbackTest('answers Invalid email with the success:false extra', async (db) => {
		const { ann } = await seedFamilyRoster(db);
		const failure = await sendFamilyInvite(memberCtx(db), actorFromUser(ann, 'session'), {
			familyId: 'fam-1',
			email: 'not-an-email',
			firstName: 'Guest',
			lastName: 'User'
		}).catch((error: unknown) => error);
		expect(failure).toMatchObject({
			status: 400,
			message: 'Invalid email',
			extra: { success: false }
		});
	});
});

describe('mintFamilyInviteLink', () => {
	rollbackTest('mints the shared ten-use, one-day code and returns the token link', async (db) => {
		const { ann } = await seedFamilyRoster(db);
		const recorded = calls();
		const link = await mintFamilyInviteLink(memberCtx(db, recorded), actorFromUser(ann, 'session'), {
			familyId: 'fam-1',
			email: 'guest@example.test',
			firstName: 'Guest',
			lastName: 'User'
		});

		const [row] = await db.select().from(familyInviteCodes);
		expect([row.maxUses, row.useCount, row.createdBy]).toEqual([10, 0, ann.id]);
		expect(link).toBe(`https://test.familyplanz.com/family/invite/email?token=${row.code}`);
		expect(recorded.links[0].inviteCode).toBe(row.code);
	});

	rollbackTest("refuses a plain member with the link door's own copy", async (db) => {
		const { cid } = await seedFamilyRoster(db);
		const failure = await mintFamilyInviteLink(memberCtx(db), actorFromUser(cid, 'session'), {
			familyId: 'fam-1',
			email: 'guest@example.test',
			firstName: 'Guest',
			lastName: 'User'
		}).catch((error: unknown) => error);
		expect(failure).toMatchObject({
			status: 403,
			message: 'Only the family creator or an admin can generate invite links'
		});
	});
});

describe('changeMember', () => {
	rollbackTest('applies the role first and stops at its first refusal', async (db) => {
		const { bob, cid } = await seedFamilyRoster(db);
		const failure = await changeMember(memberCtx(db), actorFromUser(bob, 'session'), {
			familyId: 'fam-1',
			userId: cid.id,
			role: 'owner',
			memberType: 'parent'
		}).catch((error: unknown) => error);
		expect(failure).toMatchObject({ status: 400, message: 'Role must be creator, admin, or member' });

		const [row] = await db.select().from(familyMembers).where(eq(familyMembers.userId, cid.id));
		expect([row.role, row.memberType]).toEqual(['member', 'member']);
	});

	rollbackTest("leaves the creator's role untouchable", async (db) => {
		const { ann, bob } = await seedFamilyRoster(db);
		const failure = await changeMember(memberCtx(db), actorFromUser(bob, 'session'), {
			familyId: 'fam-1',
			userId: ann.id,
			role: 'member'
		}).catch((error: unknown) => error);
		expect(failure).toMatchObject({
			status: 403,
			message: "Cannot change the family creator's role"
		});
	});

	rollbackTest('makes Member Type admin-only and leaves the role alone', async (db) => {
		const { bob, cid, dee } = await seedFamilyRoster(db);
		const plain = await changeMember(memberCtx(db), actorFromUser(cid, 'session'), {
			familyId: 'fam-1',
			userId: dee.id,
			memberType: 'parent'
		}).catch((error: unknown) => error);
		expect(plain).toMatchObject({
			status: 403,
			message: 'You do not have permission to perform this action'
		});

		await changeMember(memberCtx(db), actorFromUser(bob, 'session'), {
			familyId: 'fam-1',
			userId: dee.id,
			memberType: 'child'
		});
		const [row] = await db.select().from(familyMembers).where(eq(familyMembers.userId, dee.id));
		expect([row.role, row.memberType]).toEqual(['member', 'child']);
	});

	rollbackTest('requires at least one of role and Member Type', async (db) => {
		const { bob, cid } = await seedFamilyRoster(db);
		const failure = await changeMember(memberCtx(db), actorFromUser(bob, 'session'), {
			familyId: 'fam-1',
			userId: cid.id
		}).catch((error: unknown) => error);
		expect(failure).toMatchObject({ status: 400, message: 'role or memberType is required' });
	});
});

describe('removeFamilyMember', () => {
	rollbackTest("clears the removed member's tasks through the port and drops the roster row", async (db) => {
		const { bob, cid } = await seedFamilyRoster(db);
		const recorded = calls();

		await removeFamilyMember(memberCtx(db, recorded), actorFromUser(bob, 'session'), {
			familyId: 'fam-1',
			userId: cid.id
		});

		expect(recorded.tasks).toEqual([['fam-1', cid.id]]);
		const rows = await db
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.familyId, 'fam-1'))
			.orderBy(asc(familyMembers.userId));
		expect(rows.map((row) => row.userId)).not.toContain(cid.id);
	});

	rollbackTest('refuses the creator before it checks who is asking', async (db) => {
		const { ann, out } = await seedFamilyRoster(db);
		const recorded = calls();
		const failure = await removeFamilyMember(memberCtx(db, recorded), actorFromUser(out, 'session'), {
			familyId: 'fam-1',
			userId: ann.id
		}).catch((error: unknown) => error);

		expect(failure).toMatchObject({ status: 403, message: 'Cannot remove the family creator' });
		expect(recorded.tasks).toEqual([]);
	});

	rollbackTest('answers a no-op success for a target who is not a member', async (db) => {
		const { bob, out } = await seedFamilyRoster(db);
		await removeFamilyMember(memberCtx(db), actorFromUser(bob, 'session'), {
			familyId: 'fam-1',
			userId: out.id
		});
		expect(await db.select().from(familyMembers).where(eq(familyMembers.familyId, 'fam-1'))).toHaveLength(4);
	});
});
