import { error, json } from '@sveltejs/kit';

export type SessionUser = NonNullable<App.Locals['user']>;

/**
 * For +page.server.ts loads/actions: throws a SvelteKit 401.
 */
export function requireUser(locals: App.Locals): SessionUser {
	const user = locals.user;
	if (!user) error(401, 'Unauthorized');
	return user;
}

export type JsonAuthGuard =
	| { user: SessionUser; response?: undefined }
	| { user?: undefined; response: Response };

/**
 * For +server.ts JSON endpoints: keeps the house `{ error: 'Unauthorized' }`
 * 401 body instead of throwing.
 *
 *   const auth = requireUserJson(locals);
 *   if (auth.response) return auth.response;
 *   // auth.user is narrowed here
 */
export function requireUserJson(locals: App.Locals): JsonAuthGuard {
	const user = locals.user;
	if (!user) {
		return { response: json({ error: 'Unauthorized' }, { status: 401 }) };
	}
	return { user };
}
