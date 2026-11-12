/**
 * Browser-side JSON API client: one request shape and one error-copy ladder for
 * every module's `*.api.ts`. Returns `ApiResult<T>` instead of throwing, so a
 * state class can roll back and toast without a try/catch. Folds the legacy
 * `utils/actionError.ts` status copy and the five "That didn't work" copies
 * (task K-07).
 *
 * Doc: src/lib/kernel/README.md#client
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** The `fetch` surface the client needs; tests pass a fake. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Legacy actionError.ts copy (#195), without the per-action "Couldn't …" prefix. */
const SESSION_EXPIRED = 'Your session expired. Sign in, then try again.';
const CONNECTION_RETRY = 'Check your connection (a VPN can block it), then try again.';
const CHECK_FIELDS = 'Check the details you entered, then try again.';
/** Legacy client copy for a fetch that never reached the server. */
const NETWORK_PROBLEM = 'Network problem. Try again.';

export function createApiClient(fetcher: Fetcher = fetch) {
	return {
		async request<T>(method: ApiMethod, path: string, body?: unknown): Promise<ApiResult<T>> {
			const hasBody = body !== undefined;
			let response: Response;
			try {
				response = await fetcher(path, {
					method,
					headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
					body: hasBody ? JSON.stringify(body) : undefined
				});
			} catch {
				return { ok: false, status: 0, error: NETWORK_PROBLEM };
			}

			const payload = await readJson(response);
			if (!response.ok) {
				return {
					ok: false,
					status: response.status,
					error: errorText(payload) ?? statusCopy(response.status)
				};
			}
			return { ok: true, data: payload as T };
		}
	};
}

export type ApiClient = ReturnType<typeof createApiClient>;

async function readJson(response: Response): Promise<unknown> {
	try {
		const text = await response.text();
		if (!text) return undefined;
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function errorText(payload: unknown): string | null {
	if (!payload || typeof payload !== 'object' || !('error' in payload)) return null;
	const value = payload.error;
	return typeof value === 'string' && value ? value : null;
}

function statusCopy(status: number): string {
	if (status === 401 || status === 403) return SESSION_EXPIRED;
	if (status >= 500) return CONNECTION_RETRY;
	return CHECK_FIELDS;
}
