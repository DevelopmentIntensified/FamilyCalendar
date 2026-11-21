/**
 * access invite-email service: verify one emailed family-invite token and use
 * it — join an existing account (never signed in from a bearer link), or create
 * the person, set its optional password, join and start its session.
 *
 * Ported from `(marketing)/family/invite/email/+page.server.ts`. The join is
 * family's `joinFamily` (single-use row, expiry, revocation and the size cap
 * are all enforced there, inside one transaction, issue 152) and family's
 * `previewInvite` is the legacy `verifyInviteCode` read — opening a link never
 * spends a use. `createEmailPerson` + calendar's `ensurePersonalCalendar`
 * replace legacy `createNewUser`; the token is signed with the same
 * `EMAILSECRET` as access' magic links (`ctx.config.codePepper`), so no module
 * reads the environment here.
 *
 * The page lives in access because it composes three modules: family ranks
 * below calendar, so family itself cannot create the person's personal
 * calendar, and identity's person creation is calendar-agnostic.
 *
 * Doc: ./README.md#invariants
 */
import { validateJWT } from 'oslo/jwt';
import type { Actor } from '$lib/kernel/ctx/actor';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { isAppError } from '$lib/kernel/errors/appError';
import { ensurePersonalCalendar } from '$lib/domains/calendar/index.server';
import {
	createEmailPerson,
	findPersonForSignIn,
	setPersonPassword,
	startSession,
	type SessionCookie
} from '$lib/domains/identity/index.server';
import { joinFamily, previewInvite } from '$lib/domains/family/index.server';
import { readInviteEmailPayload, type InviteEmailPayload } from './access.inviteEmail.rules';

/**
 * The claims an invite token carries, or null for an expired, forged,
 * malformed or shape-less one — the legacy load answered all of them with the
 * same `/login?error=invalid_token`.
 */
export async function readInviteEmailToken(
	ctx: Ctx,
	token: string
): Promise<InviteEmailPayload | null> {
	try {
		const jwt = await validateJWT(
			'HS256',
			new TextEncoder().encode(ctx.config.codePepper),
			token
		);
		return readInviteEmailPayload(jwt.payload);
	} catch {
		return null;
	}
}

export type InviteEmailAcceptInput = {
	readonly payload: InviteEmailPayload;
	/** Absent on the "skip for now" path: the account is created with no password. */
	readonly password?: string;
};

export type InviteEmailAcceptOutcome =
	/** An existing account joined; it signs in normally on the page it lands on. */
	| { readonly outcome: 'joined-existing' }
	/** A new person joined and is signed in with the cookie it carries. */
	| { readonly outcome: 'joined-new'; readonly familyId: string; readonly cookie: SessionCookie }
	/** Replayed, revoked, used-up or over-cap — the legacy one refusal. */
	| { readonly outcome: 'unavailable' };

/**
 * Consume the invite. An existing account is joined but never signed in from a
 * bearer invite link (`#152`); a new person is created, optionally given the
 * password the form collected, joined, and signed in. Every family refusal is
 * the same `unavailable`, so a forwarded link learns nothing about the row.
 */
export async function acceptInviteEmail(
	ctx: Ctx,
	input: InviteEmailAcceptInput
): Promise<InviteEmailAcceptOutcome> {
	const code = input.payload.inviteCode;
	if (!code) return { outcome: 'unavailable' };

	// The legacy read was the `email` account binding first, the address second.
	const existing = await findPersonForSignIn(ctx, input.payload.email);
	if (existing.person) {
		const joined = await joinOrRefuse(ctx, actorFromUser(existing.person, 'session'), code);
		if (!joined) return { outcome: 'unavailable' };
		return { outcome: 'joined-existing' };
	}
	// A binding whose person row is gone is still "an account exists": the
	// legacy accept would name a missing user, so it is the same refusal here.
	if (existing.bound) return { outcome: 'unavailable' };

	// Read the row BEFORE creating anything, exactly as legacy `verifyInviteCode`
	// did: a dead code never mints an account.
	const preview = await previewUsableInvite(ctx, code);
	if (!preview) return { outcome: 'unavailable' };

	const person = await createEmailPerson(ctx, {
		email: input.payload.email,
		firstName: input.payload.firstName,
		lastName: input.payload.lastName
	});
	await ensurePersonalCalendar(ctx, person.id);
	if (input.password) await setPersonPassword(ctx, person.id, { password: input.password });

	const joined = await joinOrRefuse(ctx, actorFromUser(person, 'session'), code);
	if (!joined) return { outcome: 'unavailable' };

	const started = await startSession(ctx, person.id);
	return { outcome: 'joined-new', familyId: preview.family.id, cookie: started.cookie };
}

/** The invite's family, or null when family refuses the code for any reason. */
async function previewUsableInvite(ctx: Ctx, code: string) {
	try {
		return await previewInvite(ctx, null, code);
	} catch (error) {
		if (isAppError(error)) return null;
		throw error;
	}
}

/** Family's accept, with its refusals folded into one `false`. */
async function joinOrRefuse(ctx: Ctx, actor: Actor, code: string): Promise<boolean> {
	try {
		await joinFamily(ctx, actor, code);
		return true;
	} catch (error) {
		if (isAppError(error)) return false;
		throw error;
	}
}
