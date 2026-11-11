import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { actorFromUser } from '../ctx/actor';
import { forbidden } from '../errors/appError';
import { invokeAction, invokeLoad, isActionFailure } from '../testing/invokeHandlers.server';
import { testCtx } from '../testing/testCtx.server';
import { requiredText, z } from '../validation/validators';
import { formAction, formFields, pageLoad } from './pageHandlers.server';

const member = actorFromUser({ id: 'u1', email: null, roles: [] }, 'session');
const admin = actorFromUser({ id: 'a1', email: null, roles: ['admin'] }, 'session');

async function redirectOf(
	promise: Promise<object>
): Promise<{ status: number; location: string } | null> {
	try {
		await promise;
		return null;
	} catch (cause) {
		if (isRedirect(cause)) return { status: cause.status, location: cause.location };
		throw cause;
	}
}

describe('pageLoad', () => {
	const tasksPage = pageLoad({ auth: 'user', handle: async ({ actor }) => ({ viewer: actor.id }) });
	const adminPage = pageLoad({ auth: 'admin', handle: async () => ({ ok: true }) });

	it('redirects signed-out visitors of user pages to /login', async () => {
		expect(await redirectOf(invokeLoad(tasksPage, { ctx: testCtx() }))).toEqual({
			status: 302,
			location: '/login'
		});
	});

	it('returns the handler data for a signed-in visitor', async () => {
		expect(await invokeLoad(tasksPage, { ctx: testCtx(), actor: member })).toEqual({
			viewer: 'u1'
		});
	});

	it('sends non-admins to /calendar and anonymous visitors to /login on admin pages', async () => {
		expect(await redirectOf(invokeLoad(adminPage, { ctx: testCtx(), actor: member }))).toEqual({
			status: 302,
			location: '/calendar'
		});
		expect(await redirectOf(invokeLoad(adminPage, { ctx: testCtx() }))).toEqual({
			status: 302,
			location: '/login'
		});
		expect(await invokeLoad(adminPage, { ctx: testCtx(), actor: admin })).toEqual({ ok: true });
	});
});

describe('formAction', () => {
	const rename = formAction({
		auth: 'user',
		form: z.object({ name: requiredText('Name is required') }),
		handle: async ({ actor, form }) => {
			if (form.name === 'Admins') throw forbidden('That name is reserved');
			return { success: true as const, renamedBy: actor.id, name: form.name };
		}
	});

	it('returns the legacy requireUserAction failure to signed-out callers', async () => {
		const result = await invokeAction(rename, { ctx: testCtx(), form: { name: 'Smiths' } });
		expect(isActionFailure(result) && result).toMatchObject({
			status: 401,
			data: { success: false, error: 'Not signed in' }
		});
	});

	it('returns 400 with the schema message for invalid fields', async () => {
		const result = await invokeAction(rename, {
			ctx: testCtx(),
			actor: member,
			form: { name: '  ' }
		});
		expect(isActionFailure(result) && result).toMatchObject({
			status: 400,
			data: { success: false, error: 'Name is required' }
		});
	});

	it('maps AppError to fail(status) and passes success data through', async () => {
		const refused = await invokeAction(rename, {
			ctx: testCtx(),
			actor: member,
			form: { name: 'Admins' }
		});
		expect(isActionFailure(refused) && refused).toMatchObject({
			status: 403,
			data: { success: false, error: 'That name is reserved' }
		});
		const ok = await invokeAction(rename, {
			ctx: testCtx(),
			actor: member,
			form: { name: 'Smiths' }
		});
		expect(ok).toEqual({ success: true, renamedBy: 'u1', name: 'Smiths' });
	});

	it('files unexpected errors and answers fail(500) with the fail message', async () => {
		const ctx = testCtx();
		const broken = formAction({
			auth: 'user',
			failMessage: 'Could not save',
			handle: async () => {
				throw new Error('boom');
			}
		});
		const result = await invokeAction(broken, { ctx, actor: member, form: {}, path: '/account' });
		expect(isActionFailure(result) && result).toMatchObject({
			status: 500,
			data: { success: false, error: 'Could not save' }
		});
		expect(ctx.faults.reports).toEqual([
			{ status: 500, message: 'boom', path: '/account', userId: 'u1' }
		]);
	});
});

describe('formFields', () => {
	it('keeps single values scalar and repeated keys as arrays', () => {
		const data = new FormData();
		data.append('name', 'Smiths');
		data.append('ids', 'a');
		data.append('ids', 'b');
		expect(formFields(data)).toEqual({ name: 'Smiths', ids: ['a', 'b'] });
	});
});
