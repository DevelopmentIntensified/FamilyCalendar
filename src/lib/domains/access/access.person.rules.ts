/**
 * access person rules: the Anonymous Account predicate the auth flows branch
 * on, in one home. A guest is a user row whose email ends the reserved
 * placeholder domain; "registered" is a real email, never `email` truthiness
 * (guests carry a placeholder, so truthiness is always true).
 *
 * These rules mirror identity's `isAnonymousAccount` / `isRegisteredAccount`
 * (`identity.person.rules.ts:18-42`, itself the ONE predicate for the app).
 * They live here only until identity's `index.ts` exports them: R2 forbids
 * importing another module's rules file, and access's S3 lands before that
 * export. S5 must switch these three call sites to identity's entry and delete
 * this file; see the report and docs/rewrite/modules/access.md.
 *
 * Nothing here reads the clock, the environment or the database (R4/R5).
 *
 * Doc: ./README.md#invariants
 */
export const GUEST_EMAIL_SUFFIX = '@anonymous.placeholder.invalid';

/** Anything that may carry an email: a user row, a session user, a request actor. */
export type AccessPerson = { readonly email?: string | null };

/** True only for an Anonymous Account's generated placeholder address. */
export function isGuestPerson(person: AccessPerson | null | undefined): boolean {
	return !!person?.email?.endsWith(GUEST_EMAIL_SUFFIX);
}

/** True when the person has a real (non-placeholder) email. */
export function isRegisteredPerson<T extends AccessPerson>(
	person: T | null | undefined
): person is T & { email: string } {
	return !!person?.email && !isGuestPerson(person);
}

/** The email as a wire may show it: an Anonymous Account's placeholder is `null`. */
export function maskGuestEmail(person: AccessPerson | null | undefined): string | null {
	return isRegisteredPerson(person) ? person.email : null;
}
