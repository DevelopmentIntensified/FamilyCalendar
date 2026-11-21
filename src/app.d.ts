// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { UserRow } from '$lib/kernel/db/tables.server';
import type { ActiveSession } from '$lib/domains/identity/index.server';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { Actor } from '$lib/kernel/ctx/actor';

declare global {
	namespace App {
		interface Locals {
			/** The signed-in person row the request pipeline resolved (identity owns it). */
			user: UserRow | null;
			/** The live session row plus `fresh`; null on a Bearer call. */
			session: ActiveSession | null;
			/** Dependency bag for new code; set first thing by the request pipeline (src/lib/app/requestPipeline.server.ts). Optional only so legacy test doubles still type-check. */
			ctx?: Ctx;
			/** Who is calling (new code). Mirrors `user`; null when signed out. */
			actor?: Actor | null;
		}
	}
}

// Allow `import x from './file.sql?raw'` in the bundled migration scripts.
declare module '*.sql?raw' {
	const content: string;
	export default content;
}

export {};
