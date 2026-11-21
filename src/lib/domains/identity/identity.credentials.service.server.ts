/**
 * identity credentials service: bcrypt password hashing, and the email-code
 * issue/redeem use-cases.
 *
 * Every email code is stored as `HMAC-SHA-256(pepper, code)` hex with the
 * server pepper (`ctx.config.codePepper`), never the plaintext and never a bare
 * SHA-256 a 6–8 digit code cannot defend — the three sign-in kinds, the
 * email-change code and the reset marker alike (#162, Q-116, Q-117) — and every
 * lookup binds `(hash, email, type)` so a digest match alone cannot redeem
 * (#154). Expected refusals answer `null` — the wording of a wrong or expired
 * code belongs to the flow that owns it (access), not here.
 *
 * Passwords stay bcrypt, cost 10 (no forced reset).
 *
 * Doc: ./README.md#public-interface
 */
import bcrypt from 'bcryptjs';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { CodeRow, NewCodeRow } from '$lib/kernel/db/tables.server';
import { emailCodeExpiresAt, emailCodeKey, isEmailCodeExpired } from './identity.code.rules';
import {
	deleteEmailCodeByKey,
	findEmailCodeByKey,
	insertEmailCode
} from './identity.repo.server';

/** bcrypt's cost for every new password hash. */
const PASSWORD_SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

/** One code to store: the digest and the TTL are decided here. */
export type IssueEmailCodeInput = {
	readonly code: string;
	readonly email: string;
	readonly type: string;
	readonly firstName?: string | null;
	readonly lastName?: string | null;
	readonly emailId?: string | null;
	readonly pendingEmail?: string | null;
	/** Defaults to `now + 15 minutes`; the reset marker passes the token's own expiry. */
	readonly expiresAt?: Date;
};

/**
 * Stores one code for `type` as its keyed digest — every kind, so the
 * email-change code and the reset marker never sit in `codes.code` readable
 * (Q-116), and the pepper keeps an offline dump from reversing the 6–8 digits
 * (Q-117). The expiry defaults to the 15-minute TTL.
 */
export async function issueEmailCode(ctx: Ctx, input: IssueEmailCodeInput): Promise<CodeRow> {
	const values: NewCodeRow = {
		code: emailCodeKey(input, ctx.config.codePepper).codeHash,
		expiresAt: input.expiresAt ?? emailCodeExpiresAt(ctx.clock.now()),
		email: input.email,
		type: input.type,
		firstName: input.firstName ?? null,
		lastName: input.lastName ?? null,
		emailId: input.emailId ?? null,
		pendingEmail: input.pendingEmail ?? null
	};
	return await insertEmailCode(ctx.db, values);
}

/** What redeeming binds: the code, the address it was issued to and its kind. */
export type RedeemEmailCodeInput = {
	readonly code: string;
	readonly email: string;
	readonly type: string;
};

/**
 * Redeems (and consumes) one code by its `(digest, email, type)` key: a miss,
 * a mismatched email/type, a wrong code or an expired row answers `null`. A
 * live row is deleted exactly as matched and returned, so the caller can read
 * `pendingEmail`/names.
 */
export async function redeemEmailCode(
	ctx: Ctx,
	input: RedeemEmailCodeInput
): Promise<CodeRow | null> {
	const now = ctx.clock.now();
	const key = emailCodeKey(input, ctx.config.codePepper);
	const row = await findEmailCodeByKey(ctx.db, key);
	if (!row) return null;
	if (isEmailCodeExpired(row.expiresAt, now)) {
		await deleteEmailCodeByKey(ctx.db, key);
		return null;
	}
	await deleteEmailCodeByKey(ctx.db, key);
	return row;
}
