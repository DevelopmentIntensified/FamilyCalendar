/**
 * `endpoint()` — the ONE way a `+server.ts` handler is written in new code.
 * It owns, once, everything that used to be hand-rolled per route:
 *
 *   auth          'public' | 'optional' | 'user' | 'admin' | 'cron'
 *                 user/admin missing -> 401 {"error":"Unauthorized"}
 *                 admin not admin   -> 403 {"error":"Forbidden"}
 *   rate limit    429 {"error": rule.message}   (checked after auth)
 *   query/params  zod-parsed; failure -> 400 {"error": first issue message}
 *                 query: a scalar key keeps its FIRST value (legacy `get`), a key listed in
 *                 `queryArrays` keeps every value (legacy `getAll`), absent array keys are []
 *   body          JSON; bodyMode 'json' (default): empty body = {}, malformed -> 400 {"error":"Invalid JSON"}
 *                 malformedBody {status?, error} replaces that refusal with the route's own copy
 *                 bodyMode 'lenient': malformed, empty or unreadable body = null, so the schema refuses it
 *                 bodyMode 'strict': an empty/whitespace body is refused like malformed JSON
 *                                   (with `malformedBody`'s copy when set); the rest as 'json'
 *   AppError      -> its status + {"error", ...extra}
 *   anything else -> logged, filed via ctx.faults, 500 {"error": failMessage}
 *
 * Route files stay wiring-only (arch rule R8):
 *
 *   // src/routes/api/bug-report/+server.ts
 *   import { submitBugReport } from '$lib/domains/feedback/index.server';
 *   export const POST = submitBugReport.handler;
 *
 * Tests call the same object through `invoke()` (kernel/testing).
 *
 * Doc: src/lib/kernel/README.md#http
 */
import {
	isHttpError,
	isRedirect,
	json,
	type RequestEvent,
	type RequestHandler
} from '@sveltejs/kit';
import { z } from 'zod';
import type { Actor } from '../ctx/actor';
import type { Ctx } from '../ctx/ctx.server';
import {
	errorBody,
	forbidden,
	invalid,
	isAppError,
	tooMany,
	unauthorized
} from '../errors/appError';
import { clientKeyOf } from '../ratelimit/rateLimiter';
import { firstIssueMessage, INVALID_JSON_MESSAGE, type JsonValue } from '../validation/validators';

export type EndpointAuth = 'public' | 'optional' | 'user' | 'admin' | 'cron';

export type ActorFor<A extends EndpointAuth> = A extends 'user' | 'admin'
	? Actor
	: A extends 'optional'
		? Actor | null
		: null;

export type RateLimitRule = {
	/** Bucket name; the key is `${scope}:${client ip}` (same keys as legacy `clientKey`). */
	readonly scope: string;
	readonly limit: number;
	readonly windowMs: number;
	readonly message: string;
};

/** See `EndpointSpec.bodyMode`. */
export type BodyMode = 'json' | 'lenient' | 'strict' | 'empty-object';

/** The refusal copy for a body the route could not parse. See `EndpointSpec.malformedBody`. */
export type MalformedBody = {
	/** Status of the refusal; default 400, the default copy's status. */
	readonly status?: number;
	/** The `error` sentence; the default copy is `Invalid JSON`. */
	readonly error: string;
};

type Schema = z.ZodType | undefined;
export type Parsed<S extends Schema> = S extends z.ZodType ? z.output<S> : undefined;

export type EndpointRequest<
	A extends EndpointAuth,
	Q extends Schema,
	B extends Schema,
	P extends Schema
> = {
	readonly ctx: Ctx;
	readonly actor: ActorFor<A>;
	readonly query: Parsed<Q>;
	readonly body: Parsed<B>;
	readonly params: Parsed<P>;
	/** Escape hatch for cookies/headers/client address. Prefer the parsed fields. */
	readonly event: RequestEvent;
};

export type EndpointSpec<
	A extends EndpointAuth,
	Q extends Schema,
	B extends Schema,
	P extends Schema
> = {
	readonly auth: A;
	readonly query?: Q;
	/**
	 * Query keys legacy handlers read with `searchParams.getAll(k)` instead of `get(k)`.
	 * Every other key receives its FIRST value (`?id=a&id=b` -> `'a'`), which is what legacy
	 * `get(k)` saw. A listed key receives every value in order, and `[]` when it is absent —
	 * `getAll(k)` semantics — so its schema field is an array (`z.array(...)`, usually with a
	 * default). List only keys whose `query` field is an array.
	 */
	readonly queryArrays?: readonly string[];
	readonly body?: B;
	/**
	 * How the request body is read before `body` runs. Default `'json'`: an empty body is `{}` and
	 * malformed JSON is refused with `400 {"error":"Invalid JSON"}` before the schema sees it.
	 * `'lenient'`: a malformed, empty/whitespace-only or unreadable body reaches the schema as
	 * `null`; a body that parses (including a literal `null`, a string, a number, an array) reaches
	 * it as parsed. Use it when a legacy route refused such bodies with its own sentence (usually
	 * the one it gives a non-object body) that a frozen golden pins: the contract then decides
	 * the refusal and its wording. `'strict'`: an empty or whitespace-only body is refused with
	 * `400 {"error":"Invalid JSON"}` — or the `malformedBody` copy when the route gives one —
	 * exactly like malformed JSON; every other behaviour is `'json'`. Legacy `request.json()`
	 * throws on an empty body, so a route whose golden pins `Invalid JSON` for both malformed and
	 * empty bodies opts into this mode.
	 * `'empty-object'`: an empty/whitespace-only body reads as `{}` (like `'json'`), while a
	 * malformed, unreadable or non-object body reaches the schema as `null`, so the schema owns
	 * the refusal. Use it for a legacy parser that allowed a missing body but answered its own
	 * sentence for junk (the mobile guest route).
	 * Opt in per endpoint, never by default.
	 */
	readonly bodyMode?: BodyMode;
	/**
	 * The refusal this route gave a body it could not parse, replacing the default
	 * `400 {"error":"Invalid JSON"}`. Set it when the route's own copy is pinned (groceries and
	 * the focus sessions answer `Invalid JSON body`). It covers the whole refusing reader —
	 * `'json'` and `'strict'` alike: a malformed, unreadable **and empty/whitespace-only** body,
	 * because legacy `request.json()` threw on all three; an endpoint with this option therefore
	 * no longer reads an empty body as `{}`. Bodies that parse (including the literal `null`, a
	 * string, an array) are untouched and still reach the schema. Ignored with
	 * `bodyMode: 'lenient'` and `'empty-object'`, where the schema decides every non-JSON body
	 * and there is no read refusal to rename, and when `body` is not set.
	 */
	readonly malformedBody?: MalformedBody;
	readonly params?: P;
	readonly rateLimit?: RateLimitRule;
	/** The 500 body message; default 'Something went wrong'. Keep legacy wording when porting. */
	readonly failMessage?: string;
	readonly handle: (request: EndpointRequest<A, Q, B, P>) => Promise<Response>;
};

export type Endpoint = {
	readonly auth: EndpointAuth;
	readonly handler: RequestHandler;
};

export function endpoint<
	A extends EndpointAuth,
	Q extends Schema = undefined,
	B extends Schema = undefined,
	P extends Schema = undefined
>(spec: EndpointSpec<A, Q, B, P>): Endpoint {
	return { auth: spec.auth, handler: (event) => runEndpoint(spec, event) };
}

/** 200 JSON. Bodies may contain Dates; they serialize as ISO strings. */
export function ok<T>(body: T, headers?: HeadersInit): Response {
	return json(body, { status: 200, headers });
}

/** 201 JSON. */
export function created<T>(body: T, headers?: HeadersInit): Response {
	return json(body, { status: 201, headers });
}

/** Any status with a JSON body. */
export function reply<T>(status: number, body: T, headers?: HeadersInit): Response {
	return json(body, { status, headers });
}

/** The Ctx the hooks put on the request; fails loudly when hooks did not run. */
export function requestCtx(event: RequestEvent): Ctx {
	const ctx = event.locals.ctx;
	if (!ctx)
		throw new Error('locals.ctx is missing: src/hooks.server.ts must set it before routes run');
	return ctx;
}

async function runEndpoint<
	A extends EndpointAuth,
	Q extends Schema,
	B extends Schema,
	P extends Schema
>(spec: EndpointSpec<A, Q, B, P>, event: RequestEvent): Promise<Response> {
	const ctx = requestCtx(event);
	try {
		const actor = authorize(spec.auth, event, ctx);
		if (spec.rateLimit) enforceRateLimit(ctx, event.request, spec.rateLimit);
		const query = parseInput(spec.query, queryInput(event.url, spec.queryArrays ?? []));
		const params = parseInput(spec.params, event.params);
		const read = spec.body
			? await readJsonBody(event.request, spec.bodyMode ?? 'json', spec.malformedBody)
			: undefined;
		if (read && 'refusal' in read) return read.refusal;
		const body = spec.body && read ? parseInput(spec.body, read.value) : undefined;
		return await spec.handle({
			ctx,
			// SAFETY: authorize() returns an Actor for user/admin, Actor|null for optional, null otherwise — exactly ActorFor<A>.
			actor: actor as ActorFor<A>,
			// SAFETY: parseInput returns the schema's output when a schema is given and undefined when it is not — exactly Parsed<S>.
			query: query as Parsed<Q>,
			// SAFETY: as above.
			body: body as Parsed<B>,
			// SAFETY: as above.
			params: params as Parsed<P>,
			event
		});
	} catch (error) {
		return errorResponse(error, ctx, event, spec.failMessage);
	}
}

function authorize(auth: EndpointAuth, event: RequestEvent, ctx: Ctx): Actor | null {
	const actor = event.locals.actor ?? null;
	switch (auth) {
		case 'public':
			return null;
		case 'optional':
			return actor;
		case 'user':
			if (!actor) throw unauthorized();
			return actor;
		case 'admin':
			if (!actor) throw unauthorized();
			if (!actor.isAdmin) throw forbidden();
			return actor;
		case 'cron':
			if (!isCronCaller(event.request, ctx.config.cronSecret)) throw unauthorized();
			return null;
	}
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; manual runs may use `x-cron-secret`. */
function isCronCaller(request: Request, secret: string | null): boolean {
	if (!secret) return false;
	return (
		request.headers.get('authorization') === `Bearer ${secret}` ||
		request.headers.get('x-cron-secret') === secret
	);
}

function enforceRateLimit(ctx: Ctx, request: Request, rule: RateLimitRule): void {
	if (!ctx.limiter.allow(clientKeyOf(request, rule.scope), rule.limit, rule.windowMs)) {
		throw tooMany(rule.message);
	}
}

/**
 * The query object the schema parses. A scalar key keeps its FIRST value, because that is what
 * legacy `searchParams.get(k)` read (`Object.fromEntries` kept the LAST); a key listed in
 * `queryArrays` gets every value, like legacy `searchParams.getAll(k)`, and `[]` when absent.
 * `?key=` (present, empty) still yields `''`, for scalars and arrays alike.
 */
function queryInput(
	url: URL,
	arrayKeys: readonly string[]
): Readonly<Record<string, string | readonly string[]>> {
	// A Map plus Object.fromEntries: a query key named `__proto__` becomes an own property, as it
	// did through Object.fromEntries before, instead of touching the object's prototype.
	const entries = new Map<string, string | readonly string[]>();
	for (const [key, value] of url.searchParams) {
		if (entries.has(key)) continue; // the first occurrence wins, like get(k)
		entries.set(key, arrayKeys.includes(key) ? url.searchParams.getAll(key) : value);
	}
	// getAll(k) is [] for an absent key; declare the same for listed keys so the schema always
	// sees the array it declares.
	for (const key of arrayKeys) {
		if (!entries.has(key)) entries.set(key, []);
	}
	return Object.fromEntries(entries);
}

function parseInput<S extends Schema>(schema: S, input: JsonValue): Parsed<S> | undefined {
	if (!schema) return undefined;
	const result = schema.safeParse(input);
	if (!result.success) throw invalid(firstIssueMessage(result.error));
	// SAFETY: safeParse succeeded on a schema of type S, so data is z.output<S>.
	return result.data as Parsed<S>;
}

type BodyRead = { readonly value: JsonValue } | { readonly refusal: Response };

async function readJsonBody(
	request: Request,
	mode: BodyMode,
	malformed: MalformedBody | undefined
): Promise<BodyRead> {
	// 'lenient' hands every body it cannot parse to the schema; 'empty-object' does the same for a
	// malformed one but still reads an empty body as {}. Neither has a read refusal to rename.
	const lenient = mode === 'lenient' || mode === 'empty-object';
	const refuse = (): BodyRead => ({
		refusal: reply(malformed?.status ?? 400, { error: malformed?.error ?? INVALID_JSON_MESSAGE })
	});
	let text: string;
	try {
		text = await request.text();
	} catch {
		return lenient ? { value: null } : refuse();
	}
	if (!text.trim()) {
		// 'strict' refuses an empty/whitespace body exactly like malformed JSON. 'json' reads it as
		// {} — unless the route pinned its own copy, whose legacy reader threw on an empty body too.
		// 'empty-object' always reads {} and leaves junk to the schema.
		if (mode === 'lenient') return { value: null };
		if (mode === 'strict' || (mode === 'json' && malformed)) return refuse();
		return { value: {} };
	}
	try {
		// SAFETY: JSON.parse only ever produces JsonValue-shaped data.
		return { value: JSON.parse(text) as JsonValue };
	} catch {
		return lenient ? { value: null } : refuse();
	}
}

function errorResponse(
	cause: unknown,
	ctx: Ctx,
	event: RequestEvent,
	failMessage?: string
): Response {
	if (isRedirect(cause) || isHttpError(cause)) throw cause;
	if (isAppError(cause)) return json(errorBody(cause), { status: cause.status });
	if (cause instanceof z.ZodError)
		return json({ error: firstIssueMessage(cause) }, { status: 400 });

	const message = cause instanceof Error ? cause.message : String(cause);
	const path = event.url.pathname;
	ctx.log.error('endpoint_fault', { path, message });
	ctx.faults.report({ status: 500, message, path, userId: event.locals.actor?.id ?? null });
	return json({ error: failMessage ?? 'Something went wrong' }, { status: 500 });
}
