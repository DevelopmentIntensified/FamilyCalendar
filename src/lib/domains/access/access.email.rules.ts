/**
 * access email/link rules: what a magic link or verification code IS, and how
 * its signed payload is read back. Pure: the clock is a parameter, nothing
 * here signs, verifies, hashes or sends (those are S5 seams), and no module,
 * file system or environment is imported (R4/R5).
 *
 * Wire facts ported from legacy `magicLink.ts`:
 * - a link is kind-tagged (`login` / `signup`), so a signup link can never be
 *   consumed as a login link, and a payload without a `kind` tag (the legacy
 *   shape) is a kind mismatch (`:383-400`);
 * - the emailed code is 8 digits and the link lives 15 minutes
 *   (`:205`, `:230-232,287-303`);
 * - the reset token lives 60 minutes and only needs an `email` claim
 *   (`forgot-password/+server.ts:67-72`, `reset/+server.ts:29-36`).
 *
 * Doc: ./README.md#invariants
 */
import { z } from '$lib/kernel/validation/validators';

export const MAGIC_LINK_KINDS = ['login', 'signup'] as const;

/** The two kinds a code+link email is minted for. */
export type MagicLinkKind = (typeof MAGIC_LINK_KINDS)[number];

/** A verification code or link lives 15 minutes (`magicLink.ts:230-232`). */
export const LINK_CODE_TTL_MS = 15 * 60 * 1000;

/** A password-reset link lives 60 minutes (`forgot-password/+server.ts:67-72`). */
export const RESET_LINK_TTL_MS = 60 * 60 * 1000;

/** The emailed code is always this many digits (`magicLink.ts:205`). */
export const EMAIL_CODE_LENGTH = 8;

export type MagicLinkPayload = {
	readonly kind: MagicLinkKind;
	readonly email: string;
	readonly firstName?: string | null;
	readonly lastName?: string | null;
	readonly code: string;
	/** #284: the sanitised `?redirect=` signed into the token; absent when unsafe. */
	readonly redirectTo?: string;
};

export type MagicLinkReadResult =
	| { readonly ok: true; readonly payload: MagicLinkPayload }
	| { readonly ok: false; readonly reason: 'invalid' | 'kind-mismatch' };

/** When a code or magic link issued at `now` stops working. */
export function emailCodeExpiry(now: Date): Date {
	return new Date(now.getTime() + LINK_CODE_TTL_MS);
}

/** When a password-reset link minted at `now` stops working. */
export function resetTokenExpiry(now: Date): Date {
	return new Date(now.getTime() + RESET_LINK_TTL_MS);
}

export function isEightDigitCode(code: string): boolean {
	return new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`).test(code);
}

/**
 * The issuance gate's bucket for an address: `signup-code:<email>` or
 * `login-code:<email>`, lowercased (`magicLink.ts:126-131`).
 */
export function magicLinkGateKey(kind: MagicLinkKind, email: string): string {
	const scope = kind === 'signup' ? 'signup-code' : 'login-code';
	return `${scope}:${email.toLowerCase()}`;
}

/** The web route a clicked link lands on (`magicLink.ts:306-313`). */
export function magicLinkCallbackPath(kind: MagicLinkKind): string {
	return `/${kind}/email/callback`;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/**
 * The signed payload is untrusted even though it is signed, so every field is
 * read through this bag and re-checked below. Optional keys let a missing
 * `kind` stay distinguishable from an unknown one.
 */
const MagicLinkBag = z.object({
	kind: z.unknown().optional(),
	email: z.unknown().optional(),
	code: z.unknown().optional(),
	firstName: z.unknown().optional(),
	lastName: z.unknown().optional(),
	redirectTo: z.unknown().optional()
});

const ResetTokenBag = z.object({ email: z.unknown().optional() });

function isMagicLinkKind(value: unknown): value is MagicLinkKind {
	return MAGIC_LINK_KINDS.some((kind) => kind === value);
}

/**
 * Reads a verified JWT's payload for `kind`. Expiry and signature belong to
 * the token seam; this decides the signed payload's shape and kind binding:
 * a missing `kind` tag is a kind mismatch, an unknown kind or missing
 * email/code is invalid, and a `signup` payload without non-empty names is
 * invalid. A non-string `redirectTo` is dropped, never coerced.
 */
export function readMagicLinkPayload(payload: unknown, kind: MagicLinkKind): MagicLinkReadResult {
	const bag = MagicLinkBag.safeParse(payload);
	if (!bag.success) return { ok: false, reason: 'invalid' };
	const fields = bag.data;
	if (!('kind' in fields)) return { ok: false, reason: 'kind-mismatch' };
	if (!isMagicLinkKind(fields.kind)) return { ok: false, reason: 'invalid' };
	if (!isNonEmptyString(fields.email) || !isNonEmptyString(fields.code)) {
		return { ok: false, reason: 'invalid' };
	}
	if (fields.kind !== kind) return { ok: false, reason: 'kind-mismatch' };
	if (
		kind === 'signup' &&
		(!isNonEmptyString(fields.firstName) || !isNonEmptyString(fields.lastName))
	) {
		return { ok: false, reason: 'invalid' };
	}
	return {
		ok: true,
		payload: {
			kind,
			email: fields.email,
			code: fields.code,
			...(typeof fields.firstName === 'string' ? { firstName: fields.firstName } : {}),
			...(typeof fields.lastName === 'string' ? { lastName: fields.lastName } : {}),
			...(typeof fields.redirectTo === 'string' ? { redirectTo: fields.redirectTo } : {})
		}
	};
}

/**
 * Reads a password-reset JWT's payload. Legacy `isResetPayload`
 * (`reset/+server.ts:29-36`) asks only for an object with a string `email`:
 * an empty claim passes the shape and is refused later by the account lookup.
 */
export function readResetTokenPayload(payload: unknown): { email: string } | null {
	const bag = ResetTokenBag.safeParse(payload);
	if (!bag.success) return null;
	const email: unknown = bag.data.email;
	return typeof email === 'string' ? { email } : null;
}
