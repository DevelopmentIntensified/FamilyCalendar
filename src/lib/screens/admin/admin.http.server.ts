/**
 * admin http: `GET /api/admin`, the `(admin)` group layout's `load`, and the
 * two register pages' loads and resolve actions.
 *
 * The counts answer one composition (`getAdminCounts`), so the nav badges and
 * the JSON cannot disagree. The legacy wire is kept exactly: `endpoint` auth
 * `admin` refuses without a session (`401 {"error":"Unauthorized"}`) and for a
 * signed-in non-admin (`403 {"error":"Forbidden"}`) before any count is read,
 * and a Bearer caller is checked here too — the hook's segment gate covers the
 * pages, not the API.
 *
 * The layout load reads `pageLoad` auth `admin`: no session → `302 /login`, a
 * signed-in non-admin → `302 /calendar`. The hook already redirects every
 * `/admin` path, so the non-admin branch is the legacy layout's unreachable
 * defence-in-depth branch (`src/routes/(admin)/+layout.server.ts:6-12`).
 *
 * The register pages add feedback's rows to their load (this screen owns no
 * tables) and their resolve action keeps the legacy `{ success: true }` answer.
 * Their loads carry the clock and zone the export text is rendered with, so
 * the page and `GET /api/admin/*` print byte-identical text.
 *
 * Doc: ./README.md#public-interface
 */
import type { RequestEvent } from '@sveltejs/kit';
import type { FeedbackBugRegister, FeedbackPhraseRegister } from '$lib/domains/feedback';
import { listFeedback, resolveFeedback } from '$lib/domains/feedback/index.server';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { isAppError } from '$lib/kernel/errors/appError';
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { formAction, pageLoad } from '$lib/kernel/http/pageHandlers.server';
import type { AdminBugRegisterData, AdminCounts, AdminPhraseRegisterData } from './admin.contract';
import { getAdminCounts } from './admin.service.server';

/** The zone feedback's registers stamp their export text in (legacy: server local, UTC). */
const EXPORT_ZONE = 'UTC';

/** `GET /api/admin` — the admin nav's open counts (#292 G19), as the layout shows them. */
export const adminCountsEndpoint = endpoint({
	auth: 'admin',
	handle: async ({ ctx }) => ok(await getAdminCounts(ctx))
});

/** `load` for the `(admin)` group: the role check plus the badge counts. */
export const adminLayoutLoad = pageLoad({
	auth: 'admin',
	handle: ({ ctx }): Promise<AdminCounts> => getAdminCounts(ctx)
});

/**
 * `load` for `/admin/bugs`: feedback's open and resolved reports plus the
 * export clock. Same auth as every `(admin)` page.
 */
export const adminBugRegisterPageLoad = pageLoad({
	auth: 'admin',
	handle: async ({ ctx, actor }): Promise<AdminBugRegisterData> => {
		// SAFETY: `listFeedback`'s `kind` argument fixes which half of its union comes back, and TypeScript cannot narrow a union through the call.
		const register = (await listFeedback(ctx, actor, 'bug')) as FeedbackBugRegister;
		return { ...register, now: ctx.clock.now(), zone: EXPORT_ZONE };
	}
});

/** `load` for `/admin/nlp`: feedback's open and resolved phrases plus the export clock. */
export const adminPhraseRegisterPageLoad = pageLoad({
	auth: 'admin',
	handle: async ({ ctx, actor }): Promise<AdminPhraseRegisterData> => {
		// SAFETY: same shape as the bug load above — the `kind` argument picks the phrase half.
		const register = (await listFeedback(ctx, actor, 'phrase')) as FeedbackPhraseRegister;
		return { ...register, now: ctx.clock.now(), zone: EXPORT_ZONE };
	}
});

/**
 * Resolve one register row from the page's own form. Legacy read `id` from the
 * form and resolved only a non-empty string, answering `{ success: true }`
 * either way — an unknown id was a no-op success, never a 404 (the 404 copy
 * belongs to the `/api` resolve, which has its own golden). Keeping that here
 * is why the missing-row refusal is swallowed and a 404 for any other reason
 * is not.
 */
async function resolveFromForm(
	ctx: Ctx,
	actor: Actor,
	kind: 'bug' | 'phrase',
	event: RequestEvent
): Promise<{ success: true }> {
	const id = (await event.request.formData()).get('id');
	if (typeof id === 'string' && id.length > 0) {
		try {
			// `resolveFeedback`'s two overloads pin the row each kind returns, so
			// a union kind cannot reach it; the branch is the same call either way.
			if (kind === 'bug') await resolveFeedback(ctx, actor, 'bug', id);
			else await resolveFeedback(ctx, actor, 'phrase', id);
		} catch (cause) {
			if (!isAppError(cause) || cause.status !== 404) throw cause;
		}
	}
	return { success: true };
}

/** `/admin/bugs?/resolve` — the legacy page action. */
export const adminResolveBugReportAction = formAction({
	auth: 'admin',
	handle: ({ ctx, actor, event }) => resolveFromForm(ctx, actor, 'bug', event)
});

/** `/admin/nlp?/resolve` — the legacy page action. */
export const adminResolveUnmatchedPhraseAction = formAction({
	auth: 'admin',
	handle: ({ ctx, actor, event }) => resolveFromForm(ctx, actor, 'phrase', event)
});
