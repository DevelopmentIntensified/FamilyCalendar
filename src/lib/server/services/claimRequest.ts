/**
 * Claim-link request (#292 G13): the /claim `request` action body, shared
 * with `POST /api/me/claim`. An Anonymous Account asks for a verify link at
 * an email; clicking it claims (or merges into) that address.
 */
import { issueClaimToken } from '$lib/server/services/claimService';
import { getUserByEmail } from '$lib/server/db/actions/users';
import {
	sendClaimLinkEmail,
	magicLinkDeps,
	type MagicLinkDeps
} from '$lib/server/services/magicLink';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import { getUrl } from '$lib/utils/getUrl';
import { isRegisteredAccount } from '$lib/utils/anonymous';

/**
 * Collaborators the request needs, injectable so tests can pass fakes
 * through a real seam. The email send goes through the magicLink module so
 * the from-address never drifts; token storage stays in claimService.
 */
export type ClaimRequestDeps = Pick<MagicLinkDeps, 'sendEmail' | 'fromEmail'> & {
	issueClaimToken: typeof issueClaimToken;
	getUserByEmail: typeof getUserByEmail;
	sendClaimLinkEmail: typeof sendClaimLinkEmail;
	baseSiteUrl: string;
};

export const defaultClaimRequestDeps: ClaimRequestDeps = {
	sendEmail: magicLinkDeps.sendEmail,
	fromEmail: magicLinkDeps.fromEmail,
	issueClaimToken,
	getUserByEmail,
	sendClaimLinkEmail,
	baseSiteUrl: getUrl()
};

export type ClaimRequestResult =
	| { ok: true; email: string }
	| { ok: false; status: number; error: string };

/**
 * `rawEmail` is read only after the account check passes. The response
 * shape is uniform whether or not the address is registered (no oracle).
 */
export async function requestClaimLink(
	request: Request,
	user: { id: string; email?: string | null },
	readEmail: () => Promise<unknown>,
	deps: ClaimRequestDeps
): Promise<ClaimRequestResult> {
	if (isRegisteredAccount(user)) {
		return { ok: false, status: 400, error: 'Account already has an email' };
	}
	const rawEmail = await readEmail();
	const email = (typeof rawEmail === 'string' ? rawEmail : '').trim().toLowerCase();
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return { ok: false, status: 400, error: 'Please enter a valid email address' };
	}
	// Throttle the email bomb before minting any token: per-IP caps spray
	// across addresses, per-email caps repeat sends to one inbox. Either
	// rejection returns the same 429 without revealing registration state.
	if (!rateLimit(clientKey(request, 'claim-ip'), 10, 15 * 60 * 1000)) {
		return { ok: false, status: 429, error: 'Too many attempts. Try again shortly.' };
	}
	if (!rateLimit(clientKey(request, `claim:${email}`), 3, 15 * 60 * 1000)) {
		return { ok: false, status: 429, error: 'Too many attempts. Try again shortly.' };
	}

	// Intentionally NOT blocking on an already-registered email: ownership is
	// proven by the link click; verify then auto-merges the guest's data.
	const token = await deps.issueClaimToken(user.id, email);
	const verifyUrl = `${deps.baseSiteUrl}/claim/verify/${token}`;
	// Tailor the email copy only: an already-registered address means the
	// click merges this device's calendar into that account.
	const existingUser = await deps.getUserByEmail(email);
	const sent = await deps.sendClaimLinkEmail(deps, {
		email,
		verifyUrl,
		alreadyRegistered: !!existingUser
	});
	if (!sent.ok) {
		return { ok: false, status: 500, error: 'Failed to send email. Please try again.' };
	}
	return { ok: true, email };
}
