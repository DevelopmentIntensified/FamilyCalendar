/**
 * Call route handlers in tests without a server:
 *
 *   const res = await invoke(submitBugReport.handler, { ctx, actor, body: { area: 'tasks', description: 'x' } });
 *   expect(res.status).toBe(200);
 *   expect(res.body).toEqual({ success: true, id: expect.any(String) });
 *
 * Works for LEGACY handlers too (they read `locals.user`): pass `user` (a real
 * users row from seedUser) and both `locals.user` and `locals.actor` are set.
 * That is how golden contract tests run unchanged before and after a port
 * (docs/rewrite/playbooks/characterize-endpoints.md).
 *
 * Doc: src/lib/kernel/README.md#testing
 */
import type { ActionFailure, ServerLoadEvent } from '@sveltejs/kit';
import { actorFromUser, type Actor } from '../ctx/actor';
import type { Ctx } from '../ctx/ctx.server';
import type { JsonValue } from '../validation/validators';

/** The users-row fields legacy handlers read from `locals.user`. */
export type LegacyUser = {
	readonly id: string;
	readonly email: string | null;
	readonly roles: string[];
	readonly firstName: string;
	readonly lastName: string;
};

export type InvokeOptions = {
	readonly ctx: Ctx;
	readonly method?: string;
	/** Request path; also used as `url.pathname` (fault reports, auto bug areas). */
	readonly path?: string;
	readonly query?: Readonly<Record<string, string>>;
	readonly params?: Readonly<Record<string, string>>;
	readonly body?: JsonValue;
	/** Raw request body (e.g. malformed JSON). Wins over `body`. */
	readonly rawBody?: string;
	readonly headers?: Readonly<Record<string, string>>;
	/** Signed-in person for NEW code. Derived from `user` when omitted. */
	readonly actor?: Actor | null;
	/** Signed-in person for LEGACY code (`locals.user`). */
	readonly user?: LegacyUser | null;
	readonly via?: Actor['via'];
	/** Parent layout data for loads. */
	readonly parentData?: Readonly<Record<string, JsonValue>>;
};

export type InvokeResult = {
	readonly status: number;
	readonly headers: Headers;
	readonly text: string;
	/** Parsed JSON body, or null when the body is not JSON. */
	readonly body: JsonValue | null;
};

/**
 * Any route handler, load or action — including the route-specific types from
 * `./$types` (they only narrow `params` and `route.id`).
 */
export type AnyRouteHandler<R> = (event: never) => R | Promise<R>;

export async function invoke(
	handler: AnyRouteHandler<Response>,
	options: InvokeOptions
): Promise<InvokeResult> {
	const response = await callWithEvent(handler, makeEvent(options));
	const text = await response.text();
	return { status: response.status, headers: response.headers, text, body: parseJsonOrNull(text) };
}

export async function invokeLoad<T>(load: AnyRouteHandler<T>, options: InvokeOptions): Promise<T> {
	return callWithEvent(load, makeEvent(options));
}

export async function invokeAction<R>(
	action: AnyRouteHandler<R>,
	options: InvokeOptions & { readonly form: Readonly<Record<string, string | readonly string[]>> }
): Promise<R> {
	const form = new FormData();
	for (const [key, value] of Object.entries(options.form)) {
		for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
	}
	return callWithEvent(action, makeEvent({ ...options, method: options.method ?? 'POST' }, form));
}

function callWithEvent<R>(handler: AnyRouteHandler<R>, event: ServerLoadEvent): R | Promise<R> {
	// SAFETY: makeEvent builds a complete RequestEvent/ServerLoadEvent double; route-specific handler types only narrow params and route.id.
	return (handler as (event: ServerLoadEvent) => R | Promise<R>)(event);
}

export function isActionFailure<F, T>(value: T | ActionFailure<F>): value is ActionFailure<F> {
	return typeof value === 'object' && value !== null && 'status' in value && 'data' in value;
}

export function makeEvent(options: InvokeOptions, form?: FormData): ServerLoadEvent {
	const method =
		options.method ??
		(options.body !== undefined || options.rawBody !== undefined ? 'POST' : 'GET');
	const url = new URL(`http://localhost${options.path ?? '/'}`);
	for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
	const headers = new Headers(options.headers);
	let requestBody: BodyInit | undefined;
	if (form) {
		requestBody = form;
	} else if (options.rawBody !== undefined) {
		requestBody = options.rawBody;
	} else if (options.body !== undefined) {
		requestBody = JSON.stringify(options.body);
		if (!headers.has('content-type')) headers.set('content-type', 'application/json');
	}
	const request = new Request(url, {
		method,
		headers,
		body: method === 'GET' ? undefined : requestBody
	});
	const user = options.user ?? null;
	const actor =
		options.actor !== undefined
			? options.actor
			: user
				? actorFromUser(user, options.via ?? 'session')
				: null;
	const cookies = new Map<string, string>();
	const event = {
		request,
		url,
		params: { ...options.params },
		locals: { ctx: options.ctx, actor, user, session: null },
		route: { id: options.path ?? '/' },
		cookies: {
			get: (name: string) => cookies.get(name),
			getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
			set: (name: string, value: string) => void cookies.set(name, value),
			delete: (name: string) => void cookies.delete(name),
			serialize: (name: string, value: string) => `${name}=${value}`
		},
		fetch,
		getClientAddress: () => '127.0.0.1',
		platform: undefined,
		setHeaders: () => {},
		isDataRequest: false,
		isSubRequest: false,
		isRemoteRequest: false,
		tracing: { enabled: false, root: undefined, current: undefined },
		depends: () => {},
		untrack: <T>(fn: () => T) => fn(),
		parent: async () => ({ ...options.parentData })
	};
	// SAFETY: a test double carrying every field our handlers read; kit internals never see it.
	return event as unknown as ServerLoadEvent;
}

function parseJsonOrNull(text: string): JsonValue | null {
	if (!text) return null;
	try {
		// SAFETY: JSON.parse only ever produces JsonValue-shaped data.
		return JSON.parse(text) as JsonValue;
	} catch {
		return null;
	}
}
