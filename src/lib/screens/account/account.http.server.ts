/**
 * The account screen's HTTP layer: the `/account` load and its nine actions,
 * the lazy per-section data route, the three `/api` handlers the goldens pin,
 * and the `/calendar/settings` redirect.
 *
 * Legacy wiring: every page action is signed-in only and answers
 * `{ success: false, error: 'Not signed in' }` to a signed-out POST, which the
 * kernel's `formAction` already reproduces. The email change is access's own
 * action (`changeEmailAction`) re-wired here exactly as legacy did, because the
 * page's banner reads its `message` field.
 *
 * The section route is page data OUTSIDE `/api` on purpose (Q-077): the Android
 * wire does not grow a path the phone never calls, and a signed-out caller gets
 * the house JSON 401 rather than a `/login` redirect because it runs no group
 * layout.
 *
 * Doc: ./README.md#public-interface
 */
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { ALERT_PREFERENCE_IDS, type AlertPreferenceId } from '$lib/domains/alerts';
import { changeEmailAction } from '$lib/domains/access/index.server';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid } from '$lib/kernel/errors/appError';
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { formAction, pageLoad } from '$lib/kernel/http/pageHandlers.server';
import {
	AccountDeleteBody,
	AccountSectionParam,
	type AccountDeleteResponse,
	type AccountMutation
} from './account.contract';
import { accountHiddenModulesFromForm } from './account.form.rules';
import { exportFileName } from './account.export.rules';
import { getAccountExport } from './account.export.service.server';
import { accountSectionHref } from './account.sections.rules';
import {
	createAccountApiToken,
	deleteAccountForActor,
	getAccountIdentity,
	getAccountPaint,
	getAccountSection,
	logoutAccountOtherDevices,
	revokeAccountApiToken,
	saveAccountCalendarSettings,
	saveAccountDashboardModules,
	setAccountNotificationPreference,
	updateAccountProfile,
	type AccountCtx
} from './account.service.server';

/**
 * The endpoint builder types `ctx` as the kernel `Ctx`; the app attaches
 * identity's two ports to every request ctx (`src/lib/app/ports.server.ts`).
 * Fails loudly when the wiring is missing rather than reading through
 * `undefined`.
 */
function accountCtx(ctx: Ctx): AccountCtx {
	if (!('calendarAccess' in ctx) || !('adConsent' in ctx)) {
		throw new Error(
			'account settings ports are not wired: src/lib/app/ports.server.ts must attach calendarAccess and adConsent'
		);
	}
	return ctx as AccountCtx;
}

/** One form value as legacy read it: a missing or repeated key is `''`. */
function formString(form: FormData, key: string): string {
	const value = form.get(key);
	return typeof value === 'string' ? value : '';
}

/** The page-action body the banner reads (`account.form.rules.ts` reads the union). */
export type AccountActionData = AccountActionForm;

/** The `/account` load: the rail's identity and the default section's model, one read. */
export const accountPageLoad = pageLoad({
	auth: 'user',
	handle: ({ ctx, actor }) => getAccountPaint(accountCtx(ctx), actor)
});

/**
 * The nine page mutations, each delegating to its owning domain through the
 * service. `updateEmail` is access's action, wired exactly as legacy wired it.
 */
export const accountFormActions = {
	/** `?/saveCalendarSettings` — the full card; identity owns defaults and consent. */
	saveCalendarSettings: formAction({
		auth: 'user',
		failMessage: 'Failed to save calendar settings',
		handle: async ({ ctx, actor, event }): Promise<AccountMutation> => {
			const form = await event.request.formData();
			return await saveAccountCalendarSettings(accountCtx(ctx), actor, {
				weekStart: formString(form, 'weekStart'),
				timeZone: formString(form, 'timeZone'),
				color: formString(form, 'color'),
				defaultView: formString(form, 'defaultView'),
				defaultCalendarId: formString(form, 'defaultCalendarId') || null,
				syncEventsToFamilyCalendar: form.get('syncEventsToFamilyCalendar') === 'on',
				autoParseEventDetails: form.get('autoParseEventDetails') === 'true',
				showAdsAsEvents: form.get('showAdsAsEvents') === 'true'
			});
		}
	}),

	/** `?/saveDashboardModules` — its own save (#105); absent checkbox means hidden. */
	saveDashboardModules: formAction({
		auth: 'user',
		failMessage: 'Failed to save dashboard modules',
		handle: async ({ ctx, actor, event }): Promise<AccountMutation> => {
			const form = await event.request.formData();
			return await saveAccountDashboardModules(ctx, actor, accountHiddenModulesFromForm(form));
		}
	}),

	/**
	 * `?/setNotificationPreference` — the posted key decides which row is
	 * written, so a hand-rolled POST cannot invent a fifth switch; the value
	 * must be the literal `true`/`false` the card posts.
	 */
	setNotificationPreference: formAction({
		auth: 'user',
		handle: async ({ ctx, actor, event }) => {
			const form = await event.request.formData();
			const preference = formString(form, 'preference');
			if (!isAccountPreferenceId(preference)) {
				throw invalid('Unknown notification preference');
			}
			const rawValue = formString(form, 'value');
			if (rawValue !== 'true' && rawValue !== 'false') {
				throw invalid('Notification preference value is required');
			}
			const result = await setAccountNotificationPreference(ctx, actor, {
				id: preference,
				value: rawValue === 'true'
			});
			// A write that could not land keeps the legacy 500 with its own
			// sentence, so the card puts the switch back and says why.
			if (!result.ok) return fail(500, { success: false, message: result.message });
			return { success: true as const, message: result.message };
		}
	}),

	/** `?/updateProfile` — both names required; identity trims and refuses. */
	updateProfile: formAction({
		auth: 'user',
		failMessage: 'Failed to update profile',
		handle: async ({ ctx, actor, event }): Promise<AccountMutation> => {
			const form = await event.request.formData();
			return await updateAccountProfile(ctx, actor, {
				firstName: formString(form, 'firstName'),
				lastName: formString(form, 'lastName')
			});
		}
	}),

	/** `?/updateEmail` — access's flow, unchanged. */
	updateEmail: changeEmailAction,

	/** `?/logoutAllDevices` — every web session except the caller's own. */
	logoutAllDevices: formAction({
		auth: 'user',
		failMessage: 'Failed to logout from all devices',
		handle: async ({ ctx, actor, event }): Promise<AccountMutation> => {
			return await logoutAccountOtherDevices(ctx, actor, event.locals.session?.id ?? null);
		}
	}),

	/** `?/createApiToken` — the plaintext is in this answer only. */
	createApiToken: formAction({
		auth: 'user',
		failMessage: 'Failed to create token',
		handle: async ({ ctx, actor, event }) => {
			const form = await event.request.formData();
			return await createAccountApiToken(ctx, actor, formString(form, 'name'));
		}
	}),

	/** `?/revokeApiToken` — owner-scoped; another user's id is a no-op success. */
	revokeApiToken: formAction({
		auth: 'user',
		failMessage: 'Failed to revoke token',
		handle: async ({ ctx, actor, event }): Promise<AccountMutation> => {
			const form = await event.request.formData();
			return await revokeAccountApiToken(ctx, actor, formString(form, 'tokenId'));
		}
	}),

	/** `?/deleteAccount` — the typed id, then home. */
	deleteAccount: formAction({
		auth: 'user',
		handle: async ({ ctx, actor, event }): Promise<never> => {
			const form = await event.request.formData();
			await deleteAccountForActor(ctx, actor, {
				confirmation: formString(form, 'confirmation'),
				currentSessionId: event.locals.session?.id ?? null
			});
			throw redirect(302, '/');
		}
	})
};

/** The posted key is one of the four; nothing else may name a row. */
function isAccountPreferenceId(value: string): value is AlertPreferenceId {
	return ALERT_PREFERENCE_IDS.some((id) => id === value);
}

/** `GET /account/section/[section]` — the lazy per-section model (Q-077). */
export const accountSectionEndpoint = endpoint({
	auth: 'user',
	params: z.object({ section: AccountSectionParam }),
	handle: async ({ ctx, actor, params }) =>
		ok(await getAccountSection(accountCtx(ctx), actor, params.section))
});

/** `GET /api/me` — the caller's own identity, ready-typed for the phone. */
export const accountMeGetEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => ok(await getAccountIdentity(ctx, actor))
});

/** `DELETE /api/me` `{confirmation}` — the typed user id deletes the account. */
export const accountMeDeleteEndpoint = endpoint({
	auth: 'user',
	body: AccountDeleteBody,
	handle: async ({ ctx, actor, body, event }): Promise<Response> => {
		await deleteAccountForActor(ctx, actor, {
			confirmation: body.confirmation,
			currentSessionId: event.locals.session?.id ?? null
		});
		const response: AccountDeleteResponse = { success: true };
		return ok(response);
	}
});

/** `GET /api/account/export` — one JSON document, as a dated attachment. */
export const accountExportEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => {
		const document = await getAccountExport(ctx, actor);
		return ok(document, {
			'Content-Type': 'application/json; charset=utf-8',
			'Content-Disposition': `attachment; filename="${exportFileName(ctx.clock.now())}"`
		});
	}
});

/** `/calendar/settings` — a 302 to the account page's Calendar section only. */
export const accountCalendarSettingsRedirect = pageLoad({
	auth: 'public',
	handle: (): never => {
		throw redirect(302, `/account${accountSectionHref('calendar')}`);
	}
});
