// src/lib/server/auth.ts
import { Lucia } from 'lucia';

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

export function getLucia() {
	if (luciaInstance) return luciaInstance;

	const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);
	luciaInstance = new Lucia(adapter, {
		sessionCookie: {
			attributes: {
				secure: process.env.NODE_ENV === 'production'
			}
		},
		getUserAttributes: (attributes) => {
			return { ...attributes };
		}
	});

	return luciaInstance;
}

export const lucia = getLucia();
