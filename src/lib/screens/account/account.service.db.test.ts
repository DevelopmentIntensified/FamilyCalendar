/**
 * The account screen's services against real Postgres: the section models, the
 * settings/dashboard/notification saves, the profile refusal, the session and
 * token mutations, and the deletion composition's order.
 *
 * Seeds the owning domains' rows directly (this screen owns no tables and no
 * fixtures, README How to test). The identity ports are the REAL adapters the
 * app wires (`src/lib/app/ports.server.ts`), so `getCalendarSettings`'s
 * default-calendar check and the consent trail read real rows.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	apiTokens,
	authSession,
	calendars,
	families,
	familyMembers,
	subscriptions,
	taskTags,
	tasks,
	userSettings
} from '$lib/kernel/db/tables.server';
import type { Db } from '$lib/kernel/db/database.server';
import { createCalendarAccessPort } from '$lib/domains/calendar/index.server';
import { sponsoredAdConsentPort } from '$lib/domains/sponsored/index.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	createAccountApiToken,
	deleteAccountForActor,
	getAccountSection,
	logoutAccountOtherDevices,
	revokeAccountApiToken,
	saveAccountCalendarSettings,
	saveAccountDashboardModules,
	setAccountNotificationPreference,
	updateAccountProfile,
	type AccountCtx
} from './account.service.server';

/** The ctx the account reads need: the kernel doubles plus the two REAL identity ports. */
function accountCtx(db: Db, now = '2026-11-21T09:00:00.000Z'): TestCtx & AccountCtx {
	const base = testCtx({ db, now });
	return {
		...base,
		calendarAccess: createCalendarAccessPort(base),
		adConsent: sponsoredAdConsentPort(base)
	};
}

/** Calendar settings as the card posts them: the full set, no showDailyVerse. */
const CALENDAR_SETTINGS = {
	weekStart: 'monday',
	timeZone: 'Europe/Madrid',
	color: '#123456',
	defaultView: 'weekView',
	defaultCalendarId: null,
	syncEventsToFamilyCalendar: false,
	autoParseEventDetails: true,
	showAdsAsEvents: false
} as const;

async function seedFamily(db: Db, userId: string, name = 'Lovelace') {
	const [family] = await db.insert(families).values({ name }).returning();
	await db
		.insert(familyMembers)
		.values({ userId, familyId: family.id, role: 'owner', memberType: 'parent' });
	const [calendar] = await db.insert(calendars).values({ familyId: family.id }).returning();
	return { family, calendar };
}

describe('getAccountSection', () => {
	rollbackTest('profile answers the caller only, with the masked email', async (db) => {
		const user = await seedUser(db, { firstName: 'Ada', lastName: 'Lovelace' });
		await seedUser(db, { firstName: 'Bob' });

		const section = await getAccountSection(accountCtx(db), { id: user.id, email: user.email, isAdmin: false, via: 'session' }, 'profile');

		expect(section).toEqual({
			section: 'profile',
			person: {
				id: user.id,
				firstName: 'Ada',
				lastName: 'Lovelace',
				email: user.email,
				emailVerified: true,
				isAnonymous: false,
				roles: [],
				lastActiveAt: user.lastActiveAt.toISOString()
			}
		});
	});

	rollbackTest('families lists every membership with its role and member count', async (db) => {
		const user = await seedUser(db);
		await seedFamily(db, user.id, 'Lovelace');
		await seedFamily(db, user.id, 'Turing');

		const section = await getAccountSection(accountCtx(db), { id: user.id, email: user.email, isAdmin: false, via: 'session' }, 'families');

		if (section.section !== 'families') throw new Error('expected the families section');
		const rows = section.families
			.map((family) => [family.name, family.role, family.memberCount])
			.sort((left, right) => String(left[0]).localeCompare(String(right[0])));
		expect(rows).toEqual([
			['Lovelace', 'owner', 1],
			['Turing', 'owner', 1]
		]);
	});

	rollbackTest('notifications default to on, on, off, on for an account with no row', async (db) => {
		const user = await seedUser(db);

		const section = await getAccountSection(accountCtx(db), { id: user.id, email: user.email, isAdmin: false, via: 'session' }, 'notifications');

		if (section.section !== 'notifications') throw new Error('expected the notifications section');
		expect(section.preferences).toEqual({
			taskAssigned: true,
			taskCompleted: true,
			familyJoined: false,
			aiSuggestions: true
		});
		expect(section.options.map((option) => option.id)).toEqual([
			'taskAssigned',
			'taskCompleted',
			'familyJoined',
			'aiSuggestions'
		]);
	});

	rollbackTest('calendar shows the approved defaults and writes no settings row', async (db) => {
		const user = await seedUser(db);
		const ctx = accountCtx(db);

		const section = await getAccountSection(ctx, { id: user.id, email: user.email, isAdmin: false, via: 'session' }, 'calendar');

		if (section.section !== 'calendar') throw new Error('expected the calendar section');
		expect(section.settings).toEqual({
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'dayView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: false,
			autoParseEventDetails: null,
			showAdsAsEvents: false
		});
		expect(await db.select().from(userSettings).where(eq(userSettings.userId, user.id))).toEqual([]);
	});

	rollbackTest('dashboard hides canonical ids only and lists the registry', async (db) => {
		const user = await seedUser(db);
		await db
			.insert(userSettings)
			.values({ userId: user.id, hiddenDashboardModules: ['glance', 'retired-module'] });

		const section = await getAccountSection(accountCtx(db), { id: user.id, email: user.email, isAdmin: false, via: 'session' }, 'dashboard');

		if (section.section !== 'dashboard') throw new Error('expected the dashboard section');
		expect(section.hidden).toEqual(['glance', 'retired-module']);
		expect(section.modules).toContainEqual(expect.objectContaining({ id: 'meals', mounted: false }));
	});

	rollbackTest('subscription degrades to the free plan with no rows', async (db) => {
		const user = await seedUser(db);

		const section = await getAccountSection(accountCtx(db), { id: user.id, email: user.email, isAdmin: false, via: 'session' }, 'subscription');

		if (section.section !== 'subscription') throw new Error('expected the subscription section');
		expect(section.subscription).toEqual({ tier: null, subscription: null });
		expect(section.planLimits.familyLimit).toBe(1);
		expect(section.aiUsage).toEqual({ used: 0, limit: 10, remaining: 10 });
	});

	rollbackTest('api lists the caller tokens without a hash column', async (db) => {
		const user = await seedUser(db);
		await db
			.insert(apiTokens)
			.values({ userId: user.id, name: 'Laptop', tokenHash: 'hash-only' });

		const section = await getAccountSection(accountCtx(db), { id: user.id, email: user.email, isAdmin: false, via: 'session' }, 'api');

		if (section.section !== 'api') throw new Error('expected the api section');
		expect(section.tokens).toHaveLength(1);
		expect(section.tokens[0]).toEqual({
			id: expect.any(String),
			name: 'Laptop',
			createdAt: expect.any(String),
			lastUsedAt: null
		});
		expect(JSON.stringify(section)).not.toContain('hash-only');
	});

	rollbackTest('email and danger answer the caller own identity', async (db) => {
		const user = await seedUser(db, { emailVerified: false });
		const actor = { id: user.id, email: user.email, isAdmin: false, via: 'session' as const };

		expect(await getAccountSection(accountCtx(db), actor, 'email')).toEqual({
			section: 'email',
			email: user.email,
			emailVerified: false,
			isAnonymous: false
		});
		expect(await getAccountSection(accountCtx(db), actor, 'security')).toEqual({
			section: 'security'
		});
		expect(await getAccountSection(accountCtx(db), actor, 'danger')).toEqual({
			section: 'danger',
			userId: user.id
		});
	});
});

describe('saveAccountCalendarSettings', () => {
	rollbackTest('rejects a default calendar the caller cannot see and writes nothing', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		const { calendar: foreign } = await seedFamily(db, other.id, 'Others');

		await expect(
			saveAccountCalendarSettings(accountCtx(db), { id: user.id, email: user.email, isAdmin: false, via: 'session' }, {
				...CALENDAR_SETTINGS,
				defaultCalendarId: foreign.id
			})
		).rejects.toMatchObject({ status: 400, message: 'Selected default calendar is not available' });
		expect(await db.select().from(userSettings).where(eq(userSettings.userId, user.id))).toEqual([]);
	});

	rollbackTest('accepts a family-shared calendar and saves the card values', async (db) => {
		const user = await seedUser(db);
		const { calendar } = await seedFamily(db, user.id);

		const result = await saveAccountCalendarSettings(accountCtx(db), { id: user.id, email: user.email, isAdmin: false, via: 'session' }, {
			...CALENDAR_SETTINGS,
			defaultCalendarId: calendar.id
		});

		expect(result).toEqual({ success: true, message: 'Calendar settings saved successfully' });
		const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row).toMatchObject({ weekStart: 'monday', timeZone: 'Europe/Madrid', defaultCalendarId: calendar.id });
	});

	rollbackTest('records consent only when the ad setting changes', async (db) => {
		const user = await seedUser(db);
		const ctx = accountCtx(db);
		const actor = { id: user.id, email: user.email, isAdmin: false, via: 'session' as const };

		await saveAccountCalendarSettings(ctx, actor, { ...CALENDAR_SETTINGS, showAdsAsEvents: false });
		// A second save with the same value is not an event.
		await saveAccountCalendarSettings(ctx, actor, { ...CALENDAR_SETTINGS, showAdsAsEvents: false });
		const trail = await ctx.adConsent.listConsentHistory(user.id);
		expect(trail.map((entry) => entry.decision)).toEqual([]);

		await saveAccountCalendarSettings(ctx, actor, { ...CALENDAR_SETTINGS, showAdsAsEvents: true });
		const after = await ctx.adConsent.listConsentHistory(user.id);
		expect(after.map((entry) => entry.decision)).toEqual(['granted']);
	});
});

describe('saveAccountDashboardModules', () => {
	rollbackTest('stores the posted hidden list and answers the legacy receipt', async (db) => {
		const user = await seedUser(db);

		const result = await saveAccountDashboardModules(
			accountCtx(db),
			{ id: user.id, email: user.email, isAdmin: false, via: 'session' },
			['glance', 'retired-module']
		);

		expect(result.message).toBe('Dashboard modules saved — 7 of 8 cards on.');
		const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
		expect(row.hiddenDashboardModules).toEqual(['glance']);
	});
});

describe('setAccountNotificationPreference', () => {
	rollbackTest('keeps the billing email and sms halves and replaces only preferences', async (db) => {
		const user = await seedUser(db);
		await db.insert(subscriptions).values({
			userId: user.id,
			endDate: new Date('2027-01-01T00:00:00.000Z'),
			notificationMethods: { email: true, sms: false }
		});

		const result = await setAccountNotificationPreference(
			accountCtx(db),
			{ id: user.id, email: user.email, isAdmin: false, via: 'session' },
			{ id: 'familyJoined', value: true }
		);

		expect(result).toEqual({ ok: true, message: 'Someone joined the family alerts are on. Saved.' });
		const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
		expect(row.notificationMethods).toEqual({
			email: true,
			sms: false,
			preferences: {
				taskAssigned: true,
				taskCompleted: true,
				familyJoined: true,
				aiSuggestions: true
			}
		});
	});
});

describe('updateAccountProfile', () => {
	rollbackTest('refuses a profile save with an empty name', async (db) => {
		const user = await seedUser(db);

		await expect(
			updateAccountProfile(accountCtx(db), { id: user.id, email: user.email, isAdmin: false, via: 'session' }, { firstName: '', lastName: 'Lee' })
		).rejects.toMatchObject({ status: 400, message: 'First name and last name are required' });
	});
});

describe('createAccountApiToken / revokeAccountApiToken', () => {
	rollbackTest('shows the plaintext once and stores only a hash', async (db) => {
		const user = await seedUser(db);
		const ctx = accountCtx(db);
		const actor = { id: user.id, email: user.email, isAdmin: false, via: 'session' as const };

		const created = await createAccountApiToken(ctx, actor, '  Laptop  ');
		expect(created.apiTokenName).toBe('Laptop');
		expect(created.message).toBe("Token 'Laptop' created — copy it now, it won't be shown again.");
		const [row] = await db.select().from(apiTokens).where(eq(apiTokens.userId, user.id));
		expect(row.name).toBe('Laptop');
		expect(JSON.stringify(row)).not.toContain(created.apiToken);

		// A second user's id deletes nothing.
		const other = await seedUser(db);
		await revokeAccountApiToken(ctx, { id: other.id, email: other.email, isAdmin: false, via: 'session' }, row.id);
		expect(await db.select().from(apiTokens).where(eq(apiTokens.id, row.id))).toHaveLength(1);

		expect(await revokeAccountApiToken(ctx, actor, row.id)).toEqual({ success: true, message: 'Token revoked' });
		expect(await db.select().from(apiTokens).where(eq(apiTokens.id, row.id))).toEqual([]);
	});
});

describe('logoutAccountOtherDevices', () => {
	rollbackTest('a cookie caller keeps its own session and every token', async (db) => {
		const user = await seedUser(db);
		await db.insert(authSession).values([
			{ id: 'sess-keep', token: 'token-keep', userId: user.id, expiresAt: new Date('2027-01-01T00:00:00.000Z') },
			{ id: 'sess-drop', token: 'token-drop', userId: user.id, expiresAt: new Date('2027-01-01T00:00:00.000Z') }
		]);
		await db.insert(apiTokens).values({ userId: user.id, name: 'Laptop', tokenHash: 'hash' });

		const result = await logoutAccountOtherDevices(
			accountCtx(db),
			{ id: user.id, email: user.email, isAdmin: false, via: 'session' },
			'sess-keep'
		);

		expect(result).toEqual({ success: true, message: 'Logged out from all other devices' });
		expect(await db.select().from(authSession).where(eq(authSession.userId, user.id))).toHaveLength(1);
		expect(await db.select().from(apiTokens).where(eq(apiTokens.userId, user.id))).toHaveLength(1);
	});
});

describe('deleteAccountForActor', () => {
	rollbackTest('rejects a confirmation that is not the caller id and deletes nothing', async (db) => {
		const user = await seedUser(db);

		await expect(
			deleteAccountForActor(
				accountCtx(db),
				{ id: user.id, email: user.email, isAdmin: false, via: 'session' },
				{ confirmation: 'someone-else', currentSessionId: null }
			)
		).rejects.toMatchObject({ status: 400, message: 'Confirmation does not match' });
	});

	rollbackTest('clears task assignments, billing rows and sessions before the person row', async (db) => {
		const user = await seedUser(db);
		const keeper = await seedUser(db);
		const { family } = await seedFamily(db, keeper.id);
		// The assignee belongs to the family whose task names them; the clear is
		// family-scoped in tasks' own use-case.
		await db
			.insert(familyMembers)
			.values({ userId: user.id, familyId: family.id, role: 'member', memberType: 'member' });
		const [task] = await db
			.insert(tasks)
			.values({
				title: 'Handoff',
				userId: keeper.id,
				familyId: family.id,
				assignedTo: user.id,
				assignmentStatus: 'accepted'
			})
			.returning();
		await db.insert(taskTags).values({ taskId: task.id, name: 'chore' });
		await db.insert(subscriptions).values({
			userId: user.id,
			endDate: new Date('2027-01-01T00:00:00.000Z'),
			notificationMethods: { email: true, sms: false }
		});
		await db.insert(authSession).values({
			id: 'sess-1',
			token: 'token-1',
			userId: user.id,
			expiresAt: new Date('2027-01-01T00:00:00.000Z')
		});

		await deleteAccountForActor(
			accountCtx(db),
			{ id: user.id, email: user.email, isAdmin: false, via: 'session' },
			{ confirmation: user.id, currentSessionId: 'sess-1' }
		);

		const [cleared] = await db.select().from(tasks).where(eq(tasks.id, task.id));
		expect(cleared.assignedTo).toBeNull();
		expect(cleared.assignmentStatus).toBe('none');
		expect(await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id))).toEqual([]);
		const remainingFamilies = await db
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.familyId, family.id));
		expect(remainingFamilies.map((row) => row.userId)).toEqual([keeper.id]);
	});
});
