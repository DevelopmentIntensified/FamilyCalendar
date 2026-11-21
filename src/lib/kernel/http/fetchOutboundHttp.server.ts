/**
 * Real `Http`: the global `fetch` with a timeout — the legacy geocoder's
 * `AbortSignal.timeout(10_000)`, now the default for every outbound call.
 * Called directly so a test injects `fetcher` instead of mocking a module.
 *
 * Config is a parameter, never `process.env` (rule R6). Per-request headers
 * (the Nominatim `User-Agent`) belong to the caller, which reads
 * `ctx.config.userAgent`.
 *
 * Doc: src/lib/kernel/README.md#outbound-http
 */
import type { Http, HttpRequest, HttpResponse } from './outboundHttp';

export type FetchHttpConfig = {
	/** Default timeout for a request that does not set its own; the legacy geocoder used 10 s. */
	readonly timeoutMs?: number;
};

export const DEFAULT_HTTP_TIMEOUT_MS = 10_000;

export function createFetchOutboundHttp(
	config: FetchHttpConfig = {},
	fetcher: typeof fetch = fetch
): Http {
	return {
		async request(request: HttpRequest): Promise<HttpResponse> {
			const response = await fetcher(request.url, {
				method: request.method ?? 'GET',
				headers: request.headers,
				body: request.body,
				signal: AbortSignal.timeout(
					request.timeoutMs ?? config.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS
				)
			});
			return { status: response.status, ok: response.ok, body: await response.text() };
		}
	};
}
