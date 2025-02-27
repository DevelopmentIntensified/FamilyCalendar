// src/lib/server/auth.ts
import { Lucia } from 'lucia';
import { dev } from '$app/environment';

import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { db } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);

console.log(dev);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      // set to `true` when using HTTPS
      secure: !dev
    }
  },
  getUserAttributes: (attributes) => {
    return {
      ...attributes
    };
  }
});

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: typeof users.$inferSelect;
  }
}
