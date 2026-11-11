// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user: import('$lib/server/auth').SessionValidationResult['user'];
			session: import('$lib/server/auth').SessionValidationResult['session'];
			/** Dependency bag for new code; set first thing by src/hooks.server.ts. Optional only so legacy test doubles still type-check. */
			ctx?: import('$lib/kernel/ctx/ctx.server').Ctx;
			/** Who is calling (new code). Mirrors `user`; null when signed out. */
			actor?: import('$lib/kernel/ctx/actor').Actor | null;
		}
	}
}

// Allow `import x from './file.sql?raw'` in the bundled migration scripts.
declare module '*.sql?raw' {
	const content: string;
	export default content;
}

export {};
