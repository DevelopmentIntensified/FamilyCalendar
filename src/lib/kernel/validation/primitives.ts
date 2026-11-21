/**
 * Validation primitives: the plain predicates a rules file shares with a
 * service, kept out of `validators.ts` so importing one never pulls the schema
 * library into a browser bundle. `validators.ts` imports them for its zod
 * schemas and re-exports nothing, so there is one home per name.
 *
 * Why the split: `validators.ts` carries zod and luxon at module scope, and a
 * page that asks for one predicate otherwise ships both (`/family` shipped the
 * 25 KB zod chunk for `isEmailAddress` alone — ADR 0010).
 *
 * Doc: src/lib/kernel/README.md#validation
 */

// The email rule the legacy auth flows used (magicLink.ts / mobileAuth.ts copies).
const EMAIL_PATTERN =
	/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export function isEmailAddress(text: string): boolean {
	return EMAIL_PATTERN.test(text);
}
