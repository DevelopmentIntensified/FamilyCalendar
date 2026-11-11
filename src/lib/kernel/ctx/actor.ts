/**
 * Actor = who is making this request, as far as authorization cares.
 * Built once per request by the session pipeline (src/hooks.server.ts via
 * src/lib/app) and handed to services as their second argument:
 *
 *   createTask(ctx, actor, input)
 *
 * Deliberately small: anything else about the person (names, settings,
 * family, anonymous-account status) is asked of the `identity` / `family`
 * modules, not carried here.
 *
 * Doc: src/lib/kernel/README.md#ctx-and-actor
 */
export type Actor = {
	readonly id: string;
	readonly email: string | null;
	readonly isAdmin: boolean;
	/** `session` = browser cookie, `token` = `Authorization: Bearer fp_...` (Android, TaskFocus). */
	readonly via: 'session' | 'token';
};

/** The users-row fields an Actor is derived from. */
export type ActorSource = {
	readonly id: string;
	readonly email: string | null;
	readonly roles: readonly string[] | null;
};

export const ADMIN_ROLE = 'admin';

export function actorFromUser(user: ActorSource, via: Actor['via']): Actor {
	return {
		id: user.id,
		email: user.email,
		isAdmin: (user.roles ?? []).includes(ADMIN_ROLE),
		via
	};
}
