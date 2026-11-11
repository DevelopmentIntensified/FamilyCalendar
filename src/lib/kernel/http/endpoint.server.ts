/**
 * `endpoint()` — the ONE way a `+server.ts` handler is written in new code.
 * It owns, once, everything that used to be hand-rolled per route:
 *
 *   auth          'public' | 'optional' | 'user' | 'admin' | 'cron'
 *                 user/admin missing -> 401 {"error":"Unauthorized"}
 *                 admin not admin   -> 403 {"error":"Forbidden"}
 *   rate limit    429 {"error": rule.message}   (checked after auth)
 *   query/params  zod-parsed; failure -> 400 {"error": first issue message}
 *   body          JSON; empty body = {}; malformed -> 400 {"error":"Invalid JSON"}
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
import { firstIssueMessage, type JsonValue } from '../validation/validators';

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
	readonly body?: B;
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
		const query = parseInput(spec.query, Object.fromEntries(event.url.searchParams));
		const params = parseInput(spec.params, event.params);
		const body = spec.body ? parseInput(spec.body, await readJsonBody(event.request)) : undefined;
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

type BoundaryInput = JsonValue | Readonly<Record<string, string>>;

function parseInput<S extends Schema>(schema: S, input: BoundaryInput): Parsed<S> | undefined {
	if (!schema) return undefined;
	const result = schema.safeParse(input);
	if (!result.success) throw invalid(firstIssueMessage(result.error));
	// SAFETY: safeParse succeeded on a schema of type S, so data is z.output<S>.
	return result.data as Parsed<S>;
}

async function readJsonBody(request: Request): Promise<JsonValue> {
	let text: string;
	try {
		text = await request.text();
	} catch {
		throw invalid('Invalid JSON');
	}
	if (!text.trim()) return {};
	try {
		// SAFETY: JSON.parse only ever produces JsonValue-shaped data.
		return JSON.parse(text) as JsonValue;
	} catch {
		throw invalid('Invalid JSON');
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
