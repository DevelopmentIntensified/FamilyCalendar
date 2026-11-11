/**
 * `pageLoad()` and `formAction()` — the ONE way `+page.server.ts` /
 * `+layout.server.ts` code is written in new code. Same idea as `endpoint()`:
 * auth, input parsing and error mapping live here once.
 *
 *   pageLoad  auth 'user'  + no actor  -> redirect 302 /login
 *             auth 'admin' + no actor  -> redirect 302 /login
 *             auth 'admin' + not admin -> redirect 302 /calendar
 *   formAction auth fails  -> fail(401, { success: false, error: 'Not signed in' })   (legacy requireUserAction shape)
 *             admin fails  -> fail(403, { success: false, error: 'Forbidden' })
 *             form invalid -> fail(400, { success: false, error: first issue })
 *             AppError     -> fail(status, { success: false, error, ...extra })
 *             other        -> logged + filed, fail(500, { success: false, error: failMessage })
 *
 * Route files stay wiring-only:
 *
 *   export const load = tasksPageLoad;
 *   export const actions = { save: saveTaskAction };
 *
 * Doc: src/lib/kernel/README.md#http
 */
import {
	fail,
	isHttpError,
	isRedirect,
	redirect,
	type ActionFailure,
	type RequestEvent,
	type ServerLoadEvent
} from '@sveltejs/kit';
import { z } from 'zod';
import type { Actor } from '../ctx/actor';
import type { Ctx } from '../ctx/ctx.server';
import { isAppError, type AppErrorExtra } from '../errors/appError';
import { firstIssueMessage } from '../validation/validators';
import { requestCtx, type Parsed } from './endpoint.server';

export type PageAuth = 'public' | 'optional' | 'user' | 'admin';

export type PageActorFor<A extends PageAuth> = A extends 'user' | 'admin'
	? Actor
	: A extends 'optional'
		? Actor | null
		: null;

export const LOGIN_PATH = '/login';
export const NON_ADMIN_HOME = '/calendar';

export type PageLoadSpec<A extends PageAuth, E extends ServerLoadEvent, T> = {
	readonly auth: A;
	readonly handle: (request: { ctx: Ctx; actor: PageActorFor<A>; event: E }) => Promise<T>;
};

export function pageLoad<A extends PageAuth, T, E extends ServerLoadEvent = ServerLoadEvent>(
	spec: PageLoadSpec<A, E, T>
): (event: E) => Promise<T> {
	return async (event) => {
		const actor = event.locals.actor ?? null;
		if ((spec.auth === 'user' || spec.auth === 'admin') && !actor) redirect(302, LOGIN_PATH);
		if (spec.auth === 'admin' && !actor?.isAdmin) redirect(302, NON_ADMIN_HOME);
		const visible = spec.auth === 'public' ? null : actor;
		// SAFETY: the guards above make `visible` an Actor for user/admin, Actor|null for optional, null for public.
		return spec.handle({ ctx: requestCtx(event), actor: visible as PageActorFor<A>, event });
	};
}

/** The failure body every form action returns. */
export type ActionFail = { success: false; error: string } & AppErrorExtra;

type FormSchema = z.ZodType | undefined;

export type FormActionSpec<A extends PageAuth, F extends FormSchema, R> = {
	readonly auth: A;
	readonly form?: F;
	readonly failMessage?: string;
	readonly handle: (request: {
		ctx: Ctx;
		actor: PageActorFor<A>;
		form: Parsed<F>;
		event: RequestEvent;
	}) => Promise<R>;
};

export function formAction<A extends PageAuth, R, F extends FormSchema = undefined>(
	spec: FormActionSpec<A, F, R>
): (event: RequestEvent) => Promise<R | ActionFailure<ActionFail>> {
	return async (event) => {
		const ctx = requestCtx(event);
		const actor = event.locals.actor ?? null;
		if ((spec.auth === 'user' || spec.auth === 'admin') && !actor) {
			return fail(401, { success: false, error: 'Not signed in' });
		}
		if (spec.auth === 'admin' && !actor?.isAdmin) {
			return fail(403, { success: false, error: 'Forbidden' });
		}
		try {
			const form = spec.form ? parseForm(spec.form, await event.request.formData()) : undefined;
			return await spec.handle({
				ctx,
				// SAFETY: guarded above exactly as in pageLoad.
				actor: (spec.auth === 'public' ? null : actor) as PageActorFor<A>,
				// SAFETY: parseForm returns z.output<F> when a schema is given; undefined otherwise.
				form: form as Parsed<F>,
				event
			});
		} catch (cause) {
			if (isRedirect(cause) || isHttpError(cause)) throw cause;
			if (isAppError(cause)) {
				return fail(cause.status, { ...cause.extra, success: false, error: cause.message });
			}
			if (cause instanceof z.ZodError) {
				return fail(400, { success: false, error: firstIssueMessage(cause) });
			}
			const message = cause instanceof Error ? cause.message : String(cause);
			const path = event.url.pathname;
			ctx.log.error('action_fault', { path, message });
			ctx.faults.report({ status: 500, message, path, userId: actor?.id ?? null });
			return fail(500, { success: false, error: spec.failMessage ?? 'Something went wrong' });
		}
	};
}

type FormValue = FormDataEntryValue | FormDataEntryValue[];

/** One value per key; repeated keys become arrays (use `formList()` for list fields). */
export function formFields(data: FormData): Readonly<Record<string, FormValue>> {
	const fields: Record<string, FormValue> = {};
	for (const key of new Set(data.keys())) {
		const all = data.getAll(key);
		fields[key] = all.length > 1 ? all : all[0];
	}
	return fields;
}

function parseForm<F extends z.ZodType>(schema: F, data: FormData): z.output<F> {
	const result = schema.safeParse(formFields(data));
	if (!result.success) throw result.error;
	return result.data;
}
