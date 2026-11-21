/**
 * identity http: the seven `/api/me/*` endpoint definitions, wire-exact.
 *
 * Route files stay wiring-only (`export const PATCH = patchSettingsEndpoint.handler`).
 * Legacy copy, statuses and absent-vs-null are pinned by
 * `identity.http.db.test.ts`; every refusal the handlers can produce comes from
 * the contract schema or the service's `AppError`.
 *
 * `PATCH /api/me/settings` alone uses `bodyMode: 'strict'`: legacy
 * `request.json()` threw on an empty body, and its golden pins
 * `400 {"error":"Invalid JSON"}` for both malformed and empty bodies. The token
 * and profile routes keep the default `'json'` (an empty body reads as `{}`).
 *
 * Doc: ./README.md#public-interface
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { created, endpoint, ok } from '$lib/kernel/http/endpoint.server';
import {
	ApiTokenCreateBody,
	ApiTokenIdParams,
	CalendarSettingsPatchBody,
	ProfileUpdateBody
} from './identity.contract';
import type { IdentityCtx } from './index.server';
import { updatePersonProfile } from './identity.person.service.server';
import { getCalendarSettings, updateCalendarSettings } from './identity.settings.service.server';
import { endOtherSessions } from './identity.session.service.server';
import {
	listApiTokens,
	mintApiToken,
	revokeApiToken
} from './identity.token.service.server';

/** `GET /api/me/api-tokens` — the caller's tokens; the hash never leaves the server. */
export const listApiTokensEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => ok({ tokens: await listApiTokens(ctx, actor) })
});

/** `POST /api/me/api-tokens {name}` — 201, the plaintext in this response only. */
export const createApiTokenEndpoint = endpoint({
	auth: 'user',
	body: ApiTokenCreateBody,
	failMessage: 'Failed to create token',
	handle: async ({ ctx, actor, body }) => {
		const minted = await mintApiToken(ctx, actor, body);
		return created({ token: minted.token, record: minted.record });
	}
});

/** `DELETE /api/me/api-tokens/:id` — owner-scoped; the same 200 either way. */
export const revokeApiTokenEndpoint = endpoint({
	auth: 'user',
	params: ApiTokenIdParams,
	failMessage: 'Failed to revoke token',
	handle: async ({ ctx, actor, params }) => {
		await revokeApiToken(ctx, actor, params.id);
		return ok({ success: true });
	}
});

/** `PATCH /api/me/profile {firstName,lastName}` — trims, writes, echoes. */
export const updateProfileEndpoint = endpoint({
	auth: 'user',
	body: ProfileUpdateBody,
	failMessage: 'Failed to update profile',
	handle: async ({ ctx, actor, body }) => {
		const person = await updatePersonProfile(ctx, actor, body);
		return ok({
			success: true,
			user: {
				id: person.id,
				firstName: person.firstName,
				lastName: person.lastName,
				email: person.email
			}
		});
	}
});

/**
 * `POST /api/me/sessions/revoke-others` — every web session except the
 * caller's own cookie session; a Bearer caller has none, so all go. API
 * tokens are not sessions and stay valid.
 */
export const revokeOtherSessionsEndpoint = endpoint({
	auth: 'user',
	failMessage: 'Failed to logout from all devices',
	handle: async ({ ctx, actor, event }) => {
		const revoked = await endOtherSessions(ctx, actor, {
			keepSessionId: event.locals.session?.id ?? null
		});
		return ok({ success: true, revoked });
	}
});

/** `GET /api/me/settings` — the /account settings card's data. */
export const getSettingsEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) => ok(await getCalendarSettings(settingsCtx(ctx), actor))
});

/**
 * `PATCH /api/me/settings` — any subset of the nine fields; the rest keep
 * their stored value, the save answers the same shape as GET. An empty body is
 * `Invalid JSON` (legacy `request.json()`), everything else as `'json'`.
 */
export const patchSettingsEndpoint = endpoint({
	auth: 'user',
	bodyMode: 'strict',
	body: CalendarSettingsPatchBody,
	failMessage: 'Failed to save calendar settings',
	handle: async ({ ctx, actor, body }) =>
		ok(await updateCalendarSettings(settingsCtx(ctx), actor, body))
});

/**
 * The endpoint builder types `ctx` as the kernel `Ctx`; the app attaches the
 * two identity ports to every ctx (`src/lib/app/ports.server.ts`). Fails
 * loudly when the wiring is missing rather than reading through `undefined`.
 */
function settingsCtx(ctx: Ctx): IdentityCtx {
	if (!('calendarAccess' in ctx) || !('adConsent' in ctx)) {
		throw new Error(
			'identity settings ports are not wired: src/lib/app/ports.server.ts must attach calendarAccess and adConsent'
		);
	}
	return ctx as IdentityCtx;
}
