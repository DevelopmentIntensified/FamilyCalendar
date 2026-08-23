// src/lib/server/auth.ts
import { Lucia, TimeSpan } from 'lucia';
import type { Cookies } from '@sveltejs/kit';

import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { db } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';

declare module 'lucia' {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: typeof users.$inferSelect;
	}
}

const SESSION_LIFETIME_DAYS = 90;

function createLucia() {
	const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);
	// NOTE: lucia 3.2.2 has no idle-period option, and it derives cookie
	// maxAge from expiresIn itself.
	return new Lucia(adapter, {
		sessionExpiresIn: new TimeSpan(SESSION_LIFETIME_DAYS, 'd'),
		sessionCookie: {
			attributes: {
				secure: process.env.NODE_ENV === 'production'
			}
		},
		getUserAttributes: (attributes) => {
			return { ...attributes };
		}
	});
}

// Keep the concrete generic type: a bare `Lucia` annotation would erase
// the user-attribute inference that hooks.server.ts relies on.
let luciaInstance: ReturnType<typeof createLucia> | null = null;

export function getLucia() {
	if (!luciaInstance) luciaInstance = createLucia();
	return luciaInstance;
}

export const lucia = getLucia();

/**
 * One place for setting Lucia's session cookie, so path/attribute policy
 * never drifts between call sites.
 */
export function setSessionCookie(
	cookies: Pick<Cookies, 'set'>,
	sessionCookie: { name: string; value: string; attributes?: object }
) {
	cookies.set(sessionCookie.name, sessionCookie.value, {
		path: '/',
		...sessionCookie.attributes
	});
}
