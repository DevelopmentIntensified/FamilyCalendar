/**
 * The account wire: the `/api` bodies the frozen golden pins, plus the internal
 * section parameter and model. Expected values are the golden's exact bodies
 * (`account.http.db.test.ts`) and the legacy handlers' coercions, never this
 * code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { JsonValue } from '$lib/kernel/validation/validators';
import { ACCOUNT_SECTIONS } from './account.sections.rules';
import {
	AccountDeleteBody,
	AccountDeleteResponse,
	AccountExportDocumentResponse,
	AccountMeResponse,
	AccountSectionModelResponse,
	AccountSectionParam,
	CONFIRMATION_MISMATCH_MESSAGE,
	type AccountSectionModel
} from './account.contract';

describe('AccountSectionParam', () => {
	it('accepts the ten section ids, in the shared order', () => {
		expect(AccountSectionParam.options).toEqual(ACCOUNT_SECTIONS.map((section) => section.id));
		for (const section of ACCOUNT_SECTIONS) {
			expect(AccountSectionParam.parse(section.id)).toBe(section.id);
		}
	});

	it.each<[string, string]>([
		['an unknown id', 'meals'],
		['an empty id', ''],
		['the wrong case', 'Profile'],
		['a hash instead of an id', '#profile']
	])('refuses %s', (_label, value) => {
		expect(AccountSectionParam.safeParse(value).success).toBe(false);
	});
});

describe('AccountMeResponse', () => {
	// Golden: GET /api/me › answers the caller identity, roles, ISO lastActiveAt and familyId.
	it('parses the caller body the golden pins', () => {
		expect(
			AccountMeResponse.parse({
				id: 'user-1',
				firstName: 'Ann',
				lastName: 'Lee',
				email: 'ann@example.test',
				emailVerified: true,
				isAnonymous: false,
				roles: ['admin'],
				lastActiveAt: '2026-11-01T10:00:00.000Z',
				familyId: 'family-1'
			})
		).toEqual({
			id: 'user-1',
			firstName: 'Ann',
			lastName: 'Lee',
			email: 'ann@example.test',
			emailVerified: true,
			isAnonymous: false,
			roles: ['admin'],
			lastActiveAt: '2026-11-01T10:00:00.000Z',
			familyId: 'family-1'
		});
	});

	// Golden: GET /api/me › masks an Anonymous Account placeholder email and reports isAnonymous.
	it('parses the Anonymous Account body (email null, names nullable)', () => {
		expect(
			AccountMeResponse.parse({
				id: 'user-2',
				firstName: 'Guest',
				lastName: null,
				email: null,
				emailVerified: false,
				isAnonymous: true,
				roles: [],
				lastActiveAt: '2026-11-02T00:00:00.000Z',
				familyId: null
			})
		).toEqual({
			id: 'user-2',
			firstName: 'Guest',
			lastName: null,
			email: null,
			emailVerified: false,
			isAnonymous: true,
			roles: [],
			lastActiveAt: '2026-11-02T00:00:00.000Z',
			familyId: null
		});
	});

	it('never carries a credential: passwordHash is not on the wire', () => {
		const body = {
			id: 'user-1',
			firstName: null,
			lastName: null,
			email: null,
			emailVerified: false,
			isAnonymous: false,
			roles: [],
			lastActiveAt: null,
			familyId: null,
			passwordHash: 'bcrypt-hash'
		};
		expect(AccountMeResponse.safeParse(body).success).toBe(false);
	});
});

describe('AccountDeleteBody', () => {
	// Legacy route: typeof confirmation === 'string' ? it : ''.
	it.each<[string, JsonValue, string]>([
		['the caller id', { confirmation: 'user-1' }, 'user-1'],
		['an absent confirmation', {}, ''],
		['a null confirmation', { confirmation: null }, ''],
		['a numeric confirmation', { confirmation: 42 }, ''],
		['a boolean confirmation', { confirmation: true }, ''],
		['whitespace kept verbatim (no trim)', { confirmation: ' user-1 ' }, ' user-1 ']
	])('reads %s as %j', (_label, body, expected) => {
		expect(AccountDeleteBody.parse(body)).toEqual({ confirmation: expected });
	});

	it('answers {success:true} for the delete response', () => {
		expect(AccountDeleteResponse.parse({ success: true })).toEqual({ success: true });
		expect(AccountDeleteResponse.safeParse({ success: false }).success).toBe(false);
	});

	it('keeps the legacy refusal copy', () => {
		// Golden: DELETE /api/me › rejects a confirmation that is not the caller id.
		expect(CONFIRMATION_MISMATCH_MESSAGE).toBe('Confirmation does not match');
	});
});

/** The golden's document for a requester with one row in every slice. */
function exportDocument(): Record<string, unknown> {
	return {
		version: 1,
		generatedAt: '2026-11-19T10:00:00.000Z',
		account: {
			id: 'user-1',
			firstName: 'Ada',
			lastName: 'Lovelace',
			email: 'ada@example.test',
			emailVerified: true,
			isAnonymous: false,
			roles: [],
			lastActiveAt: '2026-11-18T09:00:00.000Z',
			createdAt: '2026-01-01T00:00:00.000Z'
		},
		settings: [
			{
				id: 'settings-1',
				userId: 'user-1',
				timeZone: 'Europe/Madrid',
				updatedAt: '2026-11-19T09:00:00.000Z'
			}
		],
		subscriptions: [
			{
				id: 'subscription-1',
				userId: 'user-1',
				endDate: '2027-01-01T00:00:00.000Z',
				notificationMethods: { email: true, sms: false }
			}
		],
		families: [
			{
				family: {
					id: 'family-1',
					name: 'Lovelace',
					color: null,
					createdAt: '2026-01-02T03:04:05.000Z'
				},
				membership: {
					userId: 'user-1',
					familyId: 'family-1',
					role: 'owner',
					memberType: 'parent'
				},
				otherMembers: [{ id: 'user-2', firstName: 'Bob', lastName: 'Lovelace' }]
			}
		],
		events: [],
		eventAttendance: [],
		eventExceptions: [],
		tasks: [{ id: 'task-1', title: 'Mine', userId: 'user-1' }],
		taskTags: [],
		taskCompletions: [],
		bills: [{ id: 'bill-1', title: 'Rent', amountCents: 1000, userId: 'user-1' }],
		receiptItems: [{ id: 'item-1', billId: 'bill-1', label: 'Milk', priceCents: 250 }],
		groceryItems: [{ id: 'grocery-1', userId: 'user-1', name: 'Milk', nameKey: 'milk' }],
		notifications: [
			{
				id: 'notification-1',
				userId: 'user-1',
				type: 'task_assigned',
				actorName: 'Bob',
				message: 'A task was assigned to you'
			}
		]
	};
}

describe('AccountExportDocumentResponse', () => {
	it('parses the golden document', () => {
		expect(AccountExportDocumentResponse.parse(exportDocument())).toEqual(exportDocument());
	});

	it('refuses a document version other than 1', () => {
		expect(AccountExportDocumentResponse.safeParse({ ...exportDocument(), version: 2 }).success).toBe(
			false
		);
	});

	// #189: the credential is not user data.
	it('refuses an account row carrying passwordHash', () => {
		const document = exportDocument();
		const account = { ...(document.account as Record<string, unknown>), passwordHash: 'hash' };
		expect(AccountExportDocumentResponse.safeParse({ ...document, account }).success).toBe(false);
	});

	// #189: other members cross as names only.
	it('refuses another member carrying more than a name', () => {
		const document = exportDocument();
		const families = [
			{
				...(document.families as Record<string, unknown>[])[0],
				otherMembers: [{ id: 'user-2', firstName: 'Bob', lastName: 'Lovelace', email: 'bob@t' }]
			}
		];
		expect(AccountExportDocumentResponse.safeParse({ ...document, families }).success).toBe(false);
	});

	it('refuses an instant that is not ISO', () => {
		expect(
			AccountExportDocumentResponse.safeParse({
				...exportDocument(),
				generatedAt: 'yesterday'
			}).success
		).toBe(false);
	});

	it('accepts empty collections for a requester who stored nothing', () => {
		// Golden: GET /api/account/export › exports empty collections for a user
		// who has stored nothing.
		const document = exportDocument();
		expect(
			AccountExportDocumentResponse.safeParse({
				version: 1,
				generatedAt: '2026-11-19T10:00:00.000Z',
				account: document.account,
				settings: [],
				subscriptions: [],
				families: [],
				events: [],
				eventAttendance: [],
				eventExceptions: [],
				tasks: [],
				taskTags: [],
				taskCompletions: [],
				bills: [],
				receiptItems: [],
				groceryItems: [],
				notifications: []
			}).success
		).toBe(true);
	});
});

const PERSON = {
	id: 'user-1',
	firstName: 'Ada',
	lastName: 'Lovelace',
	email: 'ada@example.test',
	emailVerified: true,
	isAnonymous: false,
	roles: [],
	lastActiveAt: '2026-11-18T09:00:00.000Z'
};

const TIER = {
	id: 'tier-1',
	name: 'Family',
	tierName: 'family',
	planType: 'family',
	displayName: 'Family Plan',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	durationMonths: 12,
	enabled: true,
	familyLimit: 1,
	memberLimit: 8,
	retentionViewDays: 365,
	archivedRetentionDays: 730,
	attachmentLimitBytes: 10_485_760,
	aiEventCreationsPerMonth: 100,
	exportImportEnabled: true
};

const LIMITS = {
	familyLimit: 1,
	memberLimit: 8,
	retentionViewDays: 365,
	archivedRetentionDays: 730,
	attachmentLimitBytes: 10_485_760,
	aiEventCreationsPerMonth: 100,
	exportImportEnabled: true
};

describe('AccountSectionModelResponse', () => {
	it.each<[string, AccountSectionModel]>([
		['profile', { section: 'profile', person: PERSON }],
		[
			'families',
			{
				section: 'families',
				families: [
					{ id: 'family-1', name: 'Lovelace', role: 'owner', memberType: 'parent', memberCount: 2 }
				]
			}
		],
		[
			'notifications',
			{
				section: 'notifications',
				preferences: {
					taskAssigned: true,
					taskCompleted: true,
					familyJoined: false,
					aiSuggestions: true
				},
				options: [
					{ id: 'taskAssigned', label: 'Task assigned to me', hint: 'In-app and push', default: true }
				]
			}
		],
		[
			'calendar',
			{
				section: 'calendar',
				settings: {
					weekStart: 'sunday',
					timeZone: 'UTC',
					color: '#3b82f6',
					defaultView: 'dayView',
					defaultCalendarId: null,
					syncEventsToFamilyCalendar: false,
					autoParseEventDetails: false,
					showAdsAsEvents: false
				},
				calendars: [{ id: 'calendar-1', name: 'Personal Calendar' }],
				consentHistory: [{ decision: 'granted', recordedAt: '2026-11-01T00:00:00.000Z' }]
			}
		],
		[
			'dashboard',
			{
				section: 'dashboard',
				hidden: ['meals'],
				modules: [
					{
						id: 'verse',
						label: 'Daily Verse',
						scope: 'personal',
						band: 'info',
						meaning: 'Show the verse on your Day Dashboard.',
						mounted: true
					}
				]
			}
		],
		[
			'subscription',
			{
				section: 'subscription',
				subscription: { tier: TIER, subscription: {
					id: 'subscription-1',
					startDate: '2026-01-01T00:00:00.000Z',
					endDate: '2027-01-01T00:00:00.000Z',
					createdAt: '2026-01-01T00:00:00.000Z'
				} },
				planLimits: LIMITS,
				aiUsage: { used: 3, limit: 100, remaining: 97 },
				planPricing: { monthly: 5, annual: 50, lifetime: 99, monthlyEquivalent: 50 / 12 },
				families: [{ id: 'family-1', memberCount: 2 }]
			}
		],
		['email', { section: 'email', email: 'ada@example.test', emailVerified: true, isAnonymous: false }],
		['security', { section: 'security' }],
		[
			'api',
			{
				section: 'api',
				tokens: [
					{
						id: 'token-1',
						name: 'Laptop',
						createdAt: '2026-01-01T00:00:00.000Z',
						lastUsedAt: null
					}
				]
			}
		],
		['danger', { section: 'danger', userId: 'user-1' }]
	])('parses the %s section model', (_section, model) => {
		expect(AccountSectionModelResponse.parse(model)).toEqual(model);
	});

	it('refuses a payload that belongs to another section', () => {
		expect(
			AccountSectionModelResponse.safeParse({ section: 'email', userId: 'user-1' }).success
		).toBe(false);
	});

	it('refuses an unknown section', () => {
		expect(AccountSectionModelResponse.safeParse({ section: 'meals' }).success).toBe(false);
	});
});
