/**
 * access Claim services: an Anonymous Account asks for a Claim link at an
 * address, then clicking that link (proven by the inbox) attaches the address —
 * or, when the address already belongs to another account (a Claim Conflict),
 * merges the guest into it. The click is the proof; nothing merges silently.
 *
 * The token is 32 random bytes as hex, only its SHA-256 reaches `claim_tokens`
 * (this module's one table), it lives 15 minutes, previewing never burns it, and
 * consumption is one atomic `DELETE … RETURNING`. The link is a GET that only
 * renders a confirm page; only the POST calls `confirmClaim`.
 *
 * Doc: ./README.md#invariants
 */
import { encodeHexLowerCase } from '@oslojs/encoding';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { invalid, tooMany } from '$lib/kernel/errors/appError';
import {
	ensurePersonSettings,
	getPersonByEmail,
	setPersonEmail,
	startSession,
	type SessionCookie
} from '$lib/domains/identity/index.server';
import {
	CLAIM_ACCOUNT_HAS_EMAIL_MESSAGE,
	CLAIM_INVALID_EMAIL_MESSAGE,
	RATE_LIMIT_MESSAGE
} from './access.contract';
import {
	CLAIM_TOKEN_BYTES,
	claimEmail,
	claimEmailVariant,
	claimRequestRefusal,
	claimTokenExpiry,
	claimTokenHash,
	type ClaimEmailVariant
} from './access.claim.rules';
import {
	consumeClaimToken,
	deleteExpiredClaimTokens,
	findClaimTokenByHash,
	insertClaimToken
} from './access.repo.server';
import { mergeGuest } from './access.guestMerge.service.server';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** The two Claim mails (`magicLink.ts:432-436`); only the sentence differs. */
const CLAIM_SUBJECT: Readonly<Record<ClaimEmailVariant, string>> = {
	merge: 'Merge your calendar into your Family Planz account',
	save: 'Save your Family Planz calendar'
};

function claimEmailHtml(variant: ClaimEmailVariant, verifyUrl: string): string {
	if (variant === 'merge') {
		return `<p>This email already has a Family Planz account. Clicking the link below will bring the calendar you've added on this device into that existing account, so you can keep using it from anywhere.</p><p><a href="${verifyUrl}">Merge my calendar into my account</a></p><p>If you didn't expect this, you can safely ignore this email. The link expires in 15 minutes.</p>`;
	}
	return `<p>Click the link below to add this email to your Family Planz account and sync your calendar across devices:</p><p><a href="${verifyUrl}">Save my calendar</a></p><p>This link expires in 15 minutes.</p>`;
}

export type RequestClaimInput = {
	readonly email: unknown;
	readonly clientIp: string;
	readonly baseUrl?: string;
};

export type RequestClaimResult =
	| { readonly sent: true }
	| { readonly sent: false; readonly reason: 'send-failed' };

/**
 * `POST /api/me/claim`: guests only, the address rule's dot, then 10 / 15 min
 * per IP and 3 / 15 min per address, then mint the token, then mail it. A
 * registered address is NOT refused — the click proves ownership and merges —
 * and the answer is identical either way (only the copy differs).
 */
export async function requestClaim(
	ctx: Ctx,
	actor: Actor,
	input: RequestClaimInput
): Promise<RequestClaimResult> {
	const refusal = claimRequestRefusal(actor, input.email);
	if (refusal === 'already-has-email') throw invalid(CLAIM_ACCOUNT_HAS_EMAIL_MESSAGE);
	if (refusal === 'invalid-email') throw invalid(CLAIM_INVALID_EMAIL_MESSAGE);

	const email = claimEmail(input.email);
	if (!ctx.limiter.allow(`claim-ip:${input.clientIp}`, 10, FIFTEEN_MINUTES)) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}
	if (!ctx.limiter.allow(`claim:${email}:${input.clientIp}`, 3, FIFTEEN_MINUTES)) {
		throw tooMany(RATE_LIMIT_MESSAGE);
	}

	const token = encodeHexLowerCase(ctx.ids.random(CLAIM_TOKEN_BYTES));
	const now = ctx.clock.now();
	await insertClaimToken(
		ctx.db,
		{
			userId: actor.id,
			email,
			tokenHash: claimTokenHash(token),
			expiresAt: claimTokenExpiry(now)
		},
		now
	);

	// Tailor only the copy: an already-registered address means the click merges.
	const existing = await getPersonByEmail(ctx, email);
	const variant = claimEmailVariant(existing !== null);
	try {
		await ctx.mail.send({
			to: email,
			from: ctx.config.mailFrom,
			subject: CLAIM_SUBJECT[variant],
			html: claimEmailHtml(variant, `${input.baseUrl ?? ''}/claim/verify/${token}`)
		});
	} catch (error) {
		// The token row stays (legacy wrote it before sending); the address does
		// not reach the log line.
		ctx.log.error('access_claim_send_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
		return { sent: false, reason: 'send-failed' };
	}
	return { sent: true };
}

/** What confirming a Claim link produced, for the route to redirect on. */
export type ClaimOutcome =
	| { readonly outcome: 'claimed' }
	/** Claim Conflict: the guest merged into this account; sign into it. */
	| { readonly outcome: 'merged'; readonly cookie: SessionCookie }
	| { readonly outcome: 'invalid' };

/**
 * `POST /claim/verify/[token]`: peek without burning (another browser may have
 * previewed it), require the token's owner, consume atomically, then either
 * merge on a Claim Conflict or attach the address and backfill the settings row.
 */
export async function confirmClaim(
	ctx: Ctx,
	actor: Actor,
	input: { readonly token: string }
): Promise<ClaimOutcome> {
	const tokenHash = claimTokenHash(input.token);
	const now = ctx.clock.now();

	const claimed = await findClaimTokenByHash(ctx.db, tokenHash, now);
	if (!claimed || claimed.userId !== actor.id) return { outcome: 'invalid' };
	if (!(await consumeClaimToken(ctx.db, tokenHash, now))) return { outcome: 'invalid' };

	const existing = await getPersonByEmail(ctx, claimed.email);
	if (existing && existing.id !== claimed.userId) {
		// Claim Conflict. The token proves the clicker owns the GUEST; the inbox
		// proves they own this address too, so the merge target is the account the
		// address belongs to — the legacy `mergeGuestIntoUser(guestId, existingId)`
		// — never the guest.
		await mergeGuest(
			ctx,
			{ id: existing.id, email: existing.email, isAdmin: false, via: 'session' },
			{ guestId: claimed.userId, keep: true }
		);
		// The merge deleted the guest session, so the click signs into the target.
		const started = await startSession(ctx, existing.id);
		return { outcome: 'merged', cookie: started.cookie };
	}

	// Attaching the address also flips `emailVerified` (identity's one write).
	await setPersonEmail(ctx, actor, { email: claimed.email });
	// A claimed guest keeps using the session it already has; backfill only the
	// settings row the guest never needed.
	await ensurePersonSettings(ctx, claimed.userId);
	return { outcome: 'claimed' };
}

/**
 * Retention: tokens that expired before `now` are deleted — the peek and the
 * consume both refuse an expired row, so it can never be used again. Returns
 * how many went; `app`'s cleanup cron passes its clock's now.
 */
export async function pruneExpiredClaimTokens(ctx: Ctx, now: Date): Promise<number> {
	return await deleteExpiredClaimTokens(ctx.db, now);
}
