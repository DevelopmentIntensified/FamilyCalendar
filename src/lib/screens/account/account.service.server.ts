/**
 * The account screen's services: the identity wire's read, the lazy per-section
 * composition, and the nine mutations the page owns.
 *
 * Every rule is the owning domain's — identity's profile/settings/tokens/
 * sessions/deletion, alerts' preferences, billing's plan card, dashboardModules'
 * hide list, calendar's calendars, sponsored's consent trail (through identity's
 * settings read), family's memberships. This file only maps domain models onto
 * the screen's section model and maps the domains' refusals onto the legacy
 * action copy.
 *
 * Authorization: the page and every handler are signed-in only (the kernel's
 * `user` auth); every domain service re-checks its own scoping, so a section
 * can only ever read the caller's own rows.
 *
 * Doc: ./README.md#public-interface
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import { invalid } from '$lib/kernel/errors/appError';
import { ALERT_PREFERENCES, type AlertPreferenceId } from '$lib/domains/alerts';
import { getAlertPreferences, setAlertPreference } from '$lib/domains/alerts/index.server';
import { deleteSubscriptionsForPerson, getSubscriptionSummary } from '$lib/domains/billing/index.server';
import { listCalendars } from '$lib/domains/calendar/index.server';
import { saveHiddenModules } from '$lib/domains/dashboardModules/index.server';
import { familyIdForActor, listFamilies, listPersonFamilyIds } from '$lib/domains/family/index.server';
import {
	deletePerson,
	endAllSessions,
	endOtherSessions,
	endSession,
	getCalendarSettings,
	getPerson,
	listApiTokens,
	mintApiToken,
	revokeApiToken,
	updateCalendarSettings,
	updatePersonProfile,
	type IdentityPorts
} from '$lib/domains/identity/index.server';
import { unassignMemberTasks } from '$lib/domains/tasks/index.server';
import type {
	AccountApiTokenModel,
	AccountCalendarSettingsModel,
	AccountFamilyModel,
	AccountMe,
	AccountPagePaint,
	AccountPersonModel,
	AccountSectionModel,
	AccountSubscriptionWindowModel
} from './account.contract';
import { CONFIRMATION_MISMATCH_MESSAGE } from './account.contract';
import { accountDashboardModules } from './account.dashboard.rules';
import type { AccountSectionId } from './account.sections.rules';

/** The ctx account's reads need: identity's settings service takes its two ports. */
export type AccountCtx = Ctx & IdentityPorts;

/** What an action answers on success (the legacy `{success, message}` body). */
export type AccountMutation = { readonly success: true; readonly message: string };

/** The read `/api/me` answers: the caller's own person plus the family the chrome keys on. */
export async function getAccountIdentity(ctx: Ctx, actor: Actor): Promise<AccountMe> {
	const [person, familyId] = await Promise.all([
		getPerson(ctx, actor),
		familyIdForActor(ctx, actor)
	]);
	return {
		id: person.id,
		firstName: person.firstName,
		lastName: person.lastName,
		// `guestSafeEmail` already masked an Anonymous Account's placeholder; a
		// person with no address answers null on both branches.
		email: person.email,
		emailVerified: person.emailVerified ?? false,
		isAnonymous: person.isAnonymous,
		roles: [...person.roles],
		lastActiveAt: person.lastActiveAt?.toISOString() ?? null,
		familyId
	};
}

/** The section-independent identity the rail and the profile/email/danger bodies read. */
async function accountPerson(ctx: Ctx, actor: Actor): Promise<AccountPersonModel> {
	const person = await getPerson(ctx, actor);
	return {
		id: person.id,
		firstName: person.firstName,
		lastName: person.lastName,
		email: person.email,
		emailVerified: person.emailVerified ?? false,
		isAnonymous: person.isAnonymous,
		roles: [...person.roles],
		lastActiveAt: person.lastActiveAt?.toISOString() ?? null
	};
}

/**
 * The first paint: the profile section and its person, read once.
 */
export async function getAccountPaint(ctx: AccountCtx, actor: Actor): Promise<AccountPagePaint> {
	const section = await getAccountSection(ctx, actor, 'profile');
	if (section.section !== 'profile') {
		throw new Error('the account first paint must answer the profile section');
	}
	return { user: section.person, section, now: ctx.clock.now().toISOString() };
}

/** The calendar card's settings: the stored row's nullable columns, or the defaults. */
function accountCalendarSettings(view: {
	readonly weekStart?: string | null;
	readonly timeZone?: string | null;
	readonly color?: string | null;
	readonly defaultView?: string | null;
	readonly defaultCalendarId?: string | null;
	readonly syncEventsToFamilyCalendar?: boolean | null;
	readonly autoParseEventDetails?: boolean | null;
	readonly showAdsAsEvents?: boolean | null;
}): AccountCalendarSettingsModel {
	return {
		weekStart: view.weekStart ?? null,
		timeZone: view.timeZone ?? null,
		color: view.color ?? null,
		defaultView: view.defaultView ?? null,
		defaultCalendarId: view.defaultCalendarId ?? null,
		syncEventsToFamilyCalendar: view.syncEventsToFamilyCalendar ?? null,
		autoParseEventDetails: view.autoParseEventDetails ?? null,
		showAdsAsEvents: view.showAdsAsEvents ?? null
	};
}

/**
 * One section's data, lazy (Q-077): only the requested section's reads run, so
 * the first paint pays for one cheap model instead of the legacy eleven round
 * trips. Every branch answers its own `section` id, so the rail and the body
 * stay one list.
 */
export async function getAccountSection(
	ctx: AccountCtx,
	actor: Actor,
	section: AccountSectionId
): Promise<AccountSectionModel> {
	switch (section) {
		case 'profile':
			return { section, person: await accountPerson(ctx, actor) };

		case 'families': {
			const { families } = await listFamilies(ctx, actor);
			const rows: AccountFamilyModel[] = families.map((family) => ({
				id: family.id,
				name: family.name,
				role: family.role,
				memberType: null,
				memberCount: family.memberCount
			}));
			return { section, families: rows };
		}

		case 'notifications':
			return {
				section,
				preferences: await getAlertPreferences(ctx, actor),
				options: ALERT_PREFERENCES.map((option) => ({
					id: option.id,
					label: option.label,
					hint: option.hint,
					default: option.default
				}))
			};

		case 'calendar': {
			const [{ settings, consentHistory }, calendars] = await Promise.all([
				getCalendarSettings(ctx, actor),
				listCalendars(ctx, actor)
			]);
			return {
				section,
				settings: accountCalendarSettings(settings),
				calendars: calendars.calendars.map((calendar) => ({
					id: calendar.id,
					name: calendar.name
				})),
				consentHistory: consentHistory.map((entry) => ({
					decision: entry.decision,
					recordedAt: entry.recordedAt.toISOString()
				}))
			};
		}

		case 'dashboard': {
			const { settings } = await getCalendarSettings(ctx, actor);
			const hidden = 'hiddenDashboardModules' in settings ? (settings.hiddenDashboardModules ?? []) : [];
			return { section, hidden: [...hidden], modules: accountDashboardModules() };
		}

		case 'subscription': {
			const [summary, families] = await Promise.all([
				getSubscriptionSummary(ctx, actor),
				listFamilies(ctx, actor)
			]);
			const tier = summary.subscription.tier;
			const window: AccountSubscriptionWindowModel | null = summary.subscription.subscription
				? {
						id: summary.subscription.subscription.id,
						startDate: summary.subscription.subscription.startDate.toISOString(),
						endDate: summary.subscription.subscription.endDate.toISOString(),
						createdAt: summary.subscription.subscription.createdAt.toISOString()
					}
				: null;
			return {
				section,
				subscription: {
					tier: tier
						? {
								...tier,
								createdAt: tier.createdAt.toISOString(),
								updatedAt: tier.updatedAt.toISOString()
							}
						: null,
					subscription: window
				},
				planLimits: summary.planLimits,
				aiUsage: summary.aiUsage,
				planPricing: summary.planPricing,
				families: families.families.map((family) => ({
					id: family.id,
					memberCount: family.memberCount
				}))
			};
		}

		case 'email': {
			const person = await accountPerson(ctx, actor);
			return {
				section,
				email: person.email,
				emailVerified: person.emailVerified,
				isAnonymous: person.isAnonymous
			};
		}

		case 'security':
			return { section };

		case 'api': {
			const tokens: AccountApiTokenModel[] = (await listApiTokens(ctx, actor)).map((token) => ({
				id: token.id,
				name: token.name,
				createdAt: token.createdAt.toISOString(),
				lastUsedAt: token.lastUsedAt?.toISOString() ?? null
			}));
			return { section, tokens };
		}

		case 'danger':
			return { section, userId: actor.id };
	}
}

/**
 * `?/saveCalendarSettings` — the full set the card posts. The default-calendar
 * access check, the consent transition and the defaults are identity's; the
 * legacy receipt is this screen's.
 */
export async function saveAccountCalendarSettings(
	ctx: AccountCtx,
	actor: Actor,
	input: {
		readonly weekStart: string;
		readonly timeZone: string;
		readonly color: string;
		readonly defaultView: string;
		readonly defaultCalendarId: string | null;
		readonly syncEventsToFamilyCalendar: boolean;
		readonly autoParseEventDetails: boolean;
		readonly showAdsAsEvents: boolean;
	}
): Promise<AccountMutation> {
	await updateCalendarSettings(ctx, actor, input);
	return { success: true, message: 'Calendar settings saved successfully' };
}

/** `?/saveDashboardModules` — its own action (#105); the receipt is dashboardModules'. */
export async function saveAccountDashboardModules(
	ctx: Ctx,
	actor: Actor,
	hidden: readonly string[]
): Promise<AccountMutation> {
	const { message } = await saveHiddenModules(ctx, actor, { hidden });
	return { success: true, message };
}

/**
 * `?/setNotificationPreference` — one switch, one receipt. A write that cannot
 * land answers `ok: false` with the "did not save" sentence, so the card can
 * put the switch back where the server still has it.
 */
export async function setAccountNotificationPreference(
	ctx: Ctx,
	actor: Actor,
	input: { readonly id: AlertPreferenceId; readonly value: boolean }
): Promise<{ readonly ok: boolean; readonly message: string }> {
	return await setAlertPreference(ctx, actor, input);
}

/** `?/updateProfile` — both names required; identity owns the trim and the refusal. */
export async function updateAccountProfile(
	ctx: Ctx,
	actor: Actor,
	input: { readonly firstName: string; readonly lastName: string }
): Promise<AccountMutation> {
	await updatePersonProfile(ctx, actor, input);
	return { success: true, message: 'Profile updated successfully' };
}

/** `?/logoutAllDevices` — every web session except the caller's own; tokens untouched. */
export async function logoutAccountOtherDevices(
	ctx: Ctx,
	actor: Actor,
	keepSessionId: string | null
): Promise<AccountMutation> {
	await endOtherSessions(ctx, actor, { keepSessionId });
	return { success: true, message: 'Logged out from all other devices' };
}

/**
 * `?/createApiToken` — the plaintext exists only in this answer. Legacy trimmed
 * the name and stored at most 60 characters; identity hashes it and returns the
 * safe record.
 */
export async function createAccountApiToken(
	ctx: Ctx,
	actor: Actor,
	rawName: string
): Promise<AccountMutation & { readonly apiToken: string; readonly apiTokenName: string }> {
	const name = rawName.trim().slice(0, 60);
	const { token, record } = await mintApiToken(ctx, actor, { name });
	return {
		success: true,
		message: `Token '${record.name}' created — copy it now, it won't be shown again.`,
		apiToken: token,
		apiTokenName: record.name
	};
}

/** `?/revokeApiToken` — owner-scoped in identity's query; a foreign id is a no-op success. */
export async function revokeAccountApiToken(
	ctx: Ctx,
	actor: Actor,
	tokenId: string
): Promise<AccountMutation> {
	await revokeApiToken(ctx, actor, tokenId);
	return { success: true, message: 'Token revoked' };
}

/**
 * Deleting the account (#292 G14): the typed user id, then the caller's session
 * and every other session, then ONE transaction that owns the cross-module
 * writes in the order the FKs demand — task assignments cleared first (the
 * `assignedTo` FK would otherwise set-null them under a ghost status), the
 * billing rows (the only non-cascading user FK), then identity's person row
 * (settings, sessions and tokens cascade with it).
 */
export async function deleteAccountForActor(
	ctx: Ctx,
	actor: Actor,
	input: { readonly confirmation: string; readonly currentSessionId: string | null }
): Promise<void> {
	if (input.confirmation !== actor.id) throw invalid(CONFIRMATION_MISMATCH_MESSAGE);
	if (input.currentSessionId) await endSession(ctx, input.currentSessionId);
	await endAllSessions(ctx, actor.id);

	const familyIds = await listPersonFamilyIds(ctx, actor.id);
	await withTx(ctx, async (txCtx) => {
		for (const familyId of familyIds) await unassignMemberTasks(txCtx, familyId, actor.id);
		await deleteSubscriptionsForPerson(txCtx, actor, { personId: actor.id });
		await deletePerson(txCtx, actor);
	});
}
