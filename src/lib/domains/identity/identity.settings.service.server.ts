/**
 * identity settings service: the `/api/me/settings` view and save.
 *
 * The module's two cross-module ports are reached through the ctx, never an
 * import (R1/R3): `ctx.calendarAccess` decides whether a newly chosen default
 * calendar is visible, and `ctx.adConsent` supplies the evidence trail beside
 * the ad gate. Neither port can fail the save: a throwing consent write is
 * logged and the save still succeeds, and a throwing trail read answers an
 * empty trail — the legacy #088 rule.
 *
 * Doc: ./README.md#public-interface
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid } from '$lib/kernel/errors/appError';
import type {
	CalendarSettingsPatch,
	CalendarSettingsView,
	ConsentRecordView
} from './identity.contract';
import { DEFAULT_CALENDAR_UNAVAILABLE_MESSAGE } from './identity.contract';
import type { IdentityCtx } from './index.server';
import {
	ACCOUNT_SETTINGS_DEFAULTS,
	calendarSettingsView,
	defaultCalendarToCheck,
	newCalendarSettings
} from './identity.settings.rules';
import {
	findSettingsByPerson,
	insertSettings,
	updateSettings
} from './identity.repo.server';

/** The settings card's data: the stored row (or page defaults) plus the trail. */
export type CalendarSettingsResult = {
	readonly settings: CalendarSettingsView;
	readonly consentHistory: readonly ConsentRecordView[];
};

/** `GET /api/me/settings`: the merged view and the consent trail, newest first. */
export async function getCalendarSettings(
	ctx: IdentityCtx,
	actor: Actor
): Promise<CalendarSettingsResult> {
	const [stored, consentHistory] = await Promise.all([
		findSettingsByPerson(ctx.db, actor.id),
		readConsentHistory(ctx, actor.id)
	]);
	return { settings: calendarSettingsView(stored), consentHistory };
}

/**
 * Applies a validated PATCH: only a default calendar THIS patch sets is
 * re-checked for access (a stale stored one is kept on an unrelated change
 * such as `{timeZone}`). An existing row is written with ONLY the fields the
 * patch sent (Q-108 B), so a sparse sign-up row keeps its nulls; a person with
 * no row gets the page defaults plus the patch, because the required columns
 * have no database default. The ad-consent transition is recorded beside the
 * saved value. Answers the same shape as GET.
 */
export async function updateCalendarSettings(
	ctx: IdentityCtx,
	actor: Actor,
	patch: CalendarSettingsPatch
): Promise<CalendarSettingsResult> {
	const calendarToCheck = defaultCalendarToCheck(patch);
	if (calendarToCheck) {
		const accessible = await ctx.calendarAccess.listAccessibleCalendarIds(actor.id);
		if (!accessible.includes(calendarToCheck)) throw invalid(DEFAULT_CALENDAR_UNAVAILABLE_MESSAGE);
	}

	const stored = await findSettingsByPerson(ctx.db, actor.id);
	const previousAdsConsent = stored?.showAdsAsEvents ?? null;
	const nextAdsConsent =
		patch.showAdsAsEvents ?? previousAdsConsent ?? ACCOUNT_SETTINGS_DEFAULTS.showAdsAsEvents;
	const now = ctx.clock.now();

	if (stored) {
		await updateSettings(ctx.db, actor.id, patch, now);
	} else {
		await insertSettings(ctx.db, { userId: actor.id, ...newCalendarSettings(patch) }, now);
	}

	// Evidence beside the setting, not a second gate (#088): the settings are
	// already written, so a failure here is logged loudly instead of failing
	// the save.
	try {
		await ctx.adConsent.recordConsentChange(actor.id, previousAdsConsent, nextAdsConsent);
	} catch (error) {
		ctx.log.error('identity_consent_record_failed', {
			userId: actor.id,
			message: error instanceof Error ? error.message : String(error)
		});
	}

	return await getCalendarSettings(ctx, actor);
}

/**
 * The Dashboard Module switches' own save (#105): a separate write from the
 * calendar settings, never through `PATCH /api/me/settings` (whose contract
 * still refuses `hiddenDashboardModules` as an unknown field). A person with
 * no settings row gets the page defaults plus the hidden list; otherwise only
 * that column changes.
 */
export async function setHiddenDashboardModules(
	ctx: Ctx,
	actor: Actor,
	hidden: readonly string[]
): Promise<void> {
	const existing = await findSettingsByPerson(ctx.db, actor.id);
	const now = ctx.clock.now();
	if (existing) {
		await updateSettings(ctx.db, actor.id, { hiddenDashboardModules: [...hidden] }, now);
		return;
	}
	await insertSettings(
		ctx.db,
		{
			userId: actor.id,
			weekStart: ACCOUNT_SETTINGS_DEFAULTS.weekStart,
			timeZone: ACCOUNT_SETTINGS_DEFAULTS.timeZone,
			color: ACCOUNT_SETTINGS_DEFAULTS.color,
			defaultView: ACCOUNT_SETTINGS_DEFAULTS.defaultView,
			defaultCalendarId: ACCOUNT_SETTINGS_DEFAULTS.defaultCalendarId,
			syncEventsToFamilyCalendar: ACCOUNT_SETTINGS_DEFAULTS.syncEventsToFamilyCalendar,
			showAdsAsEvents: ACCOUNT_SETTINGS_DEFAULTS.showAdsAsEvents,
			hiddenDashboardModules: [...hidden]
		},
		now
	);
}

/** Display only: a failed trail read answers an empty trail, never a dead card. */
async function readConsentHistory(
	ctx: IdentityCtx,
	userId: string
): Promise<readonly ConsentRecordView[]> {
	try {
		return await ctx.adConsent.listConsentHistory(userId);
	} catch (error) {
		ctx.log.error('identity_consent_history_failed', {
			userId,
			message: error instanceof Error ? error.message : String(error)
		});
		return [];
	}
}
