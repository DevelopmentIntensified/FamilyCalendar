/**
 * shell api: the ONE place the chrome's four ports are wired to other modules'
 * clients. Layouts call `createShellPorts()` and pass the bundle down; a test
 * passes fakes. Nothing here is exported to other modules.
 *
 * - badge  — alerts' feed (`GET /api/notifications`), which carries the whole
 *            unread count beside the newest page (Q-072 option (a): the count
 *            comes from the existing read, one call per chrome mount).
 * - verify — access' unverified-email doors, `POST /signup/password/verify`
 *            and `POST /signup/password/resend` (the legacy banner's own two
 *            calls; the verify door reads `{code}` alone).
 * - timezone — identity's `PATCH /api/me/settings` with `keepalive`, so a save
 *            survives the navigation that unmounts the frame (#049).
 * - offline — kernel/client's queue (K-07): online state, pending count.
 *
 * A network failure rejects rather than answering a status, because the legacy
 * copy for "the request never left" differs per surface and the state classes
 * own those sentences (`shell.verify.state`, `shell.timezone.state`).
 *
 * Doc: ./README.md#public-interface
 */
import { createAlertsApi } from '$lib/domains/alerts';
import { createApiClient, type ApiResult, type Fetcher } from '$lib/kernel/client/apiClient';
import {
	getPendingCount,
	isOnline,
	subscribeToOnlineStatus
} from '$lib/kernel/client/offlineQueue';
import type { ShellPorts, ShellVerifyResult } from './shell.contract';

/** The verify door's body: the code alone (the legacy banner sent exactly this). */
const VERIFY_PATH = '/signup/password/verify';
const RESEND_PATH = '/signup/password/resend';
const SETTINGS_PATH = '/api/me/settings';

/** A fetch that asks the browser to finish the request after a navigation. */
const keepaliveFetch: Fetcher = (input, init) => fetch(input, { ...init, keepalive: true });

export function createShellPorts(): ShellPorts {
	const client = createApiClient();
	const keepalive = createApiClient(keepaliveFetch);
	const alerts = createAlertsApi();

	return {
		badge: {
			unreadCount: async () => {
				const result = await alerts.list();
				return result.ok ? result.data.unreadCount : 0;
			}
		},
		verify: {
			submitCode: async (code) => verifyAnswer(await client.request('POST', VERIFY_PATH, { code })),
			resendCode: async () => verifyAnswer(await client.request('POST', RESEND_PATH))
		},
		timezone: {
			save: async (timeZone) => {
				const result = await keepalive.request('PATCH', SETTINGS_PATH, { timeZone });
				// The once-per-user flag is set only after this resolves, so a
				// refusal or a dropped request retries next mount.
				if (!result.ok) throw new Error(result.error);
			}
		},
		offline: {
			isOnline: () => isOnline(),
			pendingCount: () => getPendingCount(),
			subscribe: (listener) => subscribeToOnlineStatus(listener)
		}
	};
}

/** An api answer as the verify state reads it: success, or the server's sentence. */
function verifyAnswer(result: ApiResult<unknown>): ShellVerifyResult {
	if (result.ok) return { ok: true };
	// Status 0 is the kernel client's "the request never reached the server".
	if (result.status === 0) throw new Error(result.error);
	return { ok: false, message: result.error };
}

/**
 * Logout's privacy half (#029 M2): drop every cached authed response before
 * the form's `POST /api/logout` navigates. Fire-and-forget by design — a
 * browser without a service worker simply has nothing cached to purge.
 */
export function purgeShellDataCache(): void {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	navigator.serviceWorker?.controller?.postMessage({ type: 'purge-data-cache' });
}
