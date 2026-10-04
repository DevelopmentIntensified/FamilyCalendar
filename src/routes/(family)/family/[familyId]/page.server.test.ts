import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Issue 124 — the approved side bands on the family page.
 *
 * `family-detail.html` was approved with four bands in its side column: the
 * shared-data links, the **active invitation** summary, the **plan usage** bar,
 * and the children-are-users constraint. Three of the four read data this
 * loader did not return, which is why they were never built.
 *
 * The rule for choosing the *active* invitation is the one that matters: an
 * expired or used-up code is not an invitation anybody can still use, so the
 * band must not present it as the live one.
 */

const state = vi.hoisted(() => ({
	// SAFETY: fixture rows — each field is a column `familyInviteCodes` /
	// `familyMembers` actually returns; `vi.hoisted` needs the type up front
	// because beforeEach rewrites these arrays.
	invites: [] as {
		code: string;
		useCount: number | null;
		maxUses: number | null;
		expiresAt: Date;
		createdBy: string | null;
	}[],
	// SAFETY: as above — the roster shape `getFamilyRoster` returns.
	roster: [] as { userId: string; firstName: string | null; lastName: string | null }[],
	membershipCount: 3,
	aiUsed: 4,
	tierName: 'Family Master'
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the seams the loader reads; each has its own coverage.
vi.mock('$lib/server/db/actions/families', () => ({
	getFamilyRoster: async () => state.roster,
	getFamilyInviteCodes: async () => state.invites,
	getUserFamilyMemberships: async () =>
		Array.from({ length: state.membershipCount }, (_, i) => ({
			family: { id: `fam-${i}`, name: `Family ${i}` }
		})),
	removeFamilyMember: async () => {},
	updateFamilies: async () => {}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the Dashboard Module switches the loader reads; that action has its own tests.
vi.mock('$lib/server/db/actions/dashboardModules', () => ({
	getFamilyModuleSwitches: async () => ({}),
	setFamilyModuleSwitch: async () => {}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the activity list the loader reads; it has its own tests.
vi.mock('$lib/server/db/actions/familyActivity', () => ({ getRecentFamilyActivity: async () => [] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the viewer's hidden-module list; not what these bands are about.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: async () => ({ hiddenDashboardModules: [] })
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the plan numbers come from the subscription service, which has its own tests.
vi.mock('$lib/server/services/subscriptionService', () => ({
	getUserSubscriptionLimits: async () => ({
		familyLimit: 5,
		memberLimit: 6,
		retentionViewDays: 30,
		archivedRetentionDays: 90,
		attachmentLimitBytes: 10485760,
		aiEventCreationsPerMonth: 10,
		exportImportEnabled: true
	}),
	getSubscriptionStatus: async () => ({ tier: { name: state.tierName }, subscription: null }),
	// The real service answers { used, limit, remaining }; a bare number here is
	// what let an object reach the plan bar and print "[object Object]/10".
	getAiUsageThisMonth: async () => ({ used: state.aiUsed, limit: 10, remaining: 10 - state.aiUsed })
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted select: the loader reads the family row and the viewer's membership.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => {
			// A thenable chain, so both `await select()...where()` and
			// `.limit(1)` resolve to rows — the same shape the sibling
			// family/page.server.test.ts stubs with.
			const rows = [{ id: 'fam-1', name: 'The Hoppers', color: '#c45e38' }, { role: 'admin' }];
			const chain = Object.assign(Promise.resolve(rows), {
				from: () => chain,
				where: () => chain,
				limit: () => Promise.resolve(rows)
			});
			return chain;
		}
	}
}));

import { load } from './+page.server';

/** The loader's return, narrowed from SvelteKit's open PageData bag. */
interface DetailData {
	family: { id: string; name: string } | null;
	activeInvite: { code: string; useCount: number; maxUses: number | null; expiresAt: string } | null;
	inviteCreatedBy: string | null;
	planUsage: {
		tierName: string | null;
		aiUsed: number;
		aiLimit: number;
		familiesUsed: number;
		familyLimit: number;
		members: number;
		memberLimit: number;
		archivedRetentionDays: number;
		exportImportEnabled: boolean;
	};
}

// SAFETY: this loader reads locals.user and params.familyId, both carried here;
// the rest of the kit event is irrelevant to what it returns.
const runLoad = load as unknown as (event: {
	params: { familyId: string };
	locals: { user: { id: string } | null };
}) => Promise<DetailData>;

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
	state.invites = [];
	state.roster = [];
	state.aiUsed = 4;
	state.tierName = 'Family Master';
});

describe('family detail loader — the active invitation band (issue 124)', () => {
	it('picks the one code somebody can still join with', async () => {
		state.invites = [
			{
				code: 'USEDUP',
				useCount: 3,
				maxUses: 3,
				expiresAt: new Date(Date.now() + HOUR),
				createdBy: null
			},
			{
				code: 'EXPIRED',
				useCount: 0,
				maxUses: 10,
				expiresAt: new Date(Date.now() - HOUR),
				createdBy: null
			},
			{
				code: 'LIVE',
				useCount: 1,
				maxUses: 10,
				expiresAt: new Date(Date.now() + HOUR),
				createdBy: 'u_mom'
			}
		];
		state.roster = [{ userId: 'u_mom', firstName: 'Maya', lastName: 'Lopez' }];

		const data = await runLoad({ params: { familyId: 'fam-1' }, locals: { user: { id: 'u_mom' } } });

		expect(data.activeInvite?.code).toBe('LIVE');
		expect(data.activeInvite?.useCount).toBe(1);
		// The prototype says "Created by Maya" — a first name, not a full name
		// and never an id.
		expect(data.inviteCreatedBy).toBe('Maya');
	});

	it('has no active invitation rather than showing a dead code', async () => {
		state.invites = [
			{
				code: 'USEDUP',
				useCount: 1,
				maxUses: 1,
				expiresAt: new Date(Date.now() + HOUR),
				createdBy: null
			}
		];

		const data = await runLoad({ params: { familyId: 'fam-1' }, locals: { user: { id: 'u_mom' } } });

		expect(data.activeInvite).toBeNull();
	});
});

describe('family detail loader — the plan usage bar (issue 124)', () => {
	it('reports the plan by name and the usage against it', async () => {
		state.aiUsed = 4;
		state.roster = [
			{ userId: 'u_mom', firstName: 'Maya', lastName: 'Lopez' },
			{ userId: 'u_dad', firstName: 'Sam', lastName: 'Smith' },
			{ userId: 'u_eli', firstName: 'Eli', lastName: 'Smith' }
		];

		const data = await runLoad({ params: { familyId: 'fam-1' }, locals: { user: { id: 'u_mom' } } });

		expect(data.planUsage).toEqual({
			tierName: 'Family Master',
			aiUsed: 4,
			aiLimit: 10,
			familiesUsed: 3,
			familyLimit: 5,
			members: 3,
			memberLimit: 6,
			archivedRetentionDays: 90,
			exportImportEnabled: true
		});
	});

	it('says "no plan" rather than naming a tier nobody has', async () => {
		state.tierName = '';

		const data = await runLoad({ params: { familyId: 'fam-1' }, locals: { user: { id: 'u_mom' } } });

		expect(data.planUsage.tierName).toBeNull();
	});
});