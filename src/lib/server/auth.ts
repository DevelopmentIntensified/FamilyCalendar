// src/lib/server/auth.ts
import { Lucia, TimeSpan, type SessionCookieAttributesOptions } from 'lucia';

import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { db } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';

declare module 'lucia' {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: typeof users.$inferSelect;
	}
}

let luciaInstance: Lucia | null = null;

const SESSION_LIFETIME_DAYS = 90;

export function getLucia() {
	if (luciaInstance) return luciaInstance;

	const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);
	luciaInstance = new Lucia(adapter, {
		sessionExpiresIn: new TimeSpan(SESSION_LIFETIME_DAYS, 'd'),
		idlePeriodExpiresIn: new TimeSpan(30, 'd'),
		sessionCookie: {
			attributes: {
				secure: process.env.NODE_ENV === 'production',
				maxAge: 60 * 60 * 24 * SESSION_LIFETIME_DAYS
			} as SessionCookieAttributesOptions
		},
		getUserAttributes: (attributes) => {
			return { ...attributes };
		}
	});

	return luciaInstance;
}

export const lucia = getLucia();

/**
 * One place for setting Lucia's session cookie, so path/attribute policy
 * never drifts between call sites.
 */
export function setSessionCookie(
	cookies: {
		set: (name: string, value: string, opts: Record<string, unknown>) => void;
	},
	sessionCookie: { name: string; value: string; attributes?: Record<string, unknown> }
) {
	cookies.set(sessionCookie.name, sessionCookie.value, {
		path: '/',
		...sessionCookie.attributes
	});
}
