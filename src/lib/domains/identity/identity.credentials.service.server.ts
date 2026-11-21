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
	deleteEmailCodesForEmail,
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
 * Reads one code by its `(digest, email, type)` key WITHOUT consuming it — the
 * reset marker's existence check (a used link must stay used) and the
 * email-change token's pre-flight. Expiry is the caller's call: the reset
 * marker expires with the token, which the signature check already refused.
 */
export async function findEmailCode(
	ctx: Ctx,
	input: RedeemEmailCodeInput
): Promise<CodeRow | null> {
	return await findEmailCodeByKey(ctx.db, emailCodeKey(input, ctx.config.codePepper));
}

/**
 * Every code bound to one address, gone — an email-change request replaces the
 * address's pending codes (legacy `deleteCodesByEmail`). Takes the address, not
 * a key, because the request must clear codes of every kind it minted for it.
 * Q-103: `type` narrows it to one kind, so an email-change request leaves the
 * durable `reset_used` marker (and any sign-in code) alone.
 */
export async function discardEmailCodes(ctx: Ctx, email: string, type?: string): Promise<void> {
	await deleteEmailCodesForEmail(ctx.db, email, type);
}

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
