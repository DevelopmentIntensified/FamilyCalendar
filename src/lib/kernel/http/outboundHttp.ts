/**
 * Outbound HTTP port + in-memory adapter. Services reach another site through
 * `ctx.http`, so no module calls the global `fetch` and a test scripts the
 * reply by URL.
 *
 * One request per call: the URL, an optional method (GET by default), headers,
 * a string body and a per-request timeout. A response carries the status, the
 * `ok` flag and the body text — a caller decides whether to parse it. A
 * network failure or a timeout **rejects**, so the caller's own legacy
 * catch answers its empty result; a non-2xx reply is a response, not a throw.
 *
 * First caller: calendar's Nominatim location search (10 s legacy timeout,
 * the legacy `User-Agent` from `ctx.config.userAgent`).
 *
 * Doc: src/lib/kernel/README.md#outbound-http
 */

export type HttpRequest = {
	readonly url: string;
	/** `GET` when omitted. */
	readonly method?: 'GET' | 'POST';
	readonly headers?: Readonly<Record<string, string>>;
	readonly body?: string;
	/** Overrides the adapter's default (10 s) for this request. */
	readonly timeoutMs?: number;
};

export type HttpResponse = {
	readonly status: number;
	readonly ok: boolean;
	readonly body: string;
};

export type Http = {
	/** One request: rejects on a network failure or a timeout, never on a non-2xx status. */
	request(request: HttpRequest): Promise<HttpResponse>;
};

export type MemoryHttp = Http & {
	/** Every request made through this port, in order (tests). */
	readonly calls: HttpRequest[];
	/** Scripts the answer for exactly `url`; a later call replaces it. An unscripted URL throws. */
	reply(url: string, response?: { readonly status?: number; readonly body?: string }): void;
};

export function createMemoryHttp(): MemoryHttp {
	const calls: HttpRequest[] = [];
	const replies = new Map<string, { readonly status: number; readonly body: string }>();
	return {
		calls,
		reply: (url, response = {}) => {
			replies.set(url, { status: response.status ?? 200, body: response.body ?? '' });
		},
		request: async (request) => {
			calls.push(request);
			const reply = replies.get(request.url);
			if (!reply) throw new Error(`No scripted HTTP reply for ${request.url}`);
			return {
				status: reply.status,
				ok: reply.status >= 200 && reply.status < 300,
				body: reply.body
			};
		}
	};
}
