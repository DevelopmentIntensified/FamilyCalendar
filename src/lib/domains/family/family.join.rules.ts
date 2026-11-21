/**
 * family join rules: the `/family/join/[code]` page's pure logic. An unusable
 * link answers in place (issue 124) — three reasons are possible and the
 * server cannot tell them apart, so the page names all three and guesses
 * none. A successful join shows the welcome panel, then moves on after a
 * beat, so the person sees that it worked.
 *
 * Doc: ./README.md#invariants
 */
import type { FamilyJoinPage } from './family.contract';

/** How long "Welcome to the family!" stays up before the redirect. */
export const FAMILY_JOIN_REDIRECT_MS = 1500;

/** The page's own sentence for a join that never reached the server. */
export const FAMILY_JOIN_NETWORK_FAILURE =
	'We could not reach the server. Check your connection and try again.';

/** The line under a join refusal: the server copy is not the whole story. */
export const FAMILY_JOIN_RETRY_NOTE = 'If this keeps happening, ask for a fresh invite link.';

/** Which face the page shows: the explanation, the join offer, or nothing to offer. */
export function familyJoinView(
	page: Pick<FamilyJoinPage, 'invalid' | 'family'>
): 'unusable' | 'join' {
	return page.invalid || !page.family ? 'unusable' : 'join';
}

/** The breadcrumbs-free headings the approved page prints. */
export const FAMILY_JOIN_UNUSABLE_HEADING = "This invite link isn't valid any more";
export const FAMILY_JOIN_UNUSABLE_BODY =
	'Nothing is wrong on your side. The link may have expired, it may have been revoked, or every use of it may already have been taken.';
export const FAMILY_JOIN_UNUSABLE_ADVICE =
	'Ask whoever invited you to send you a new link — it takes them a moment on their family page.';
export const FAMILY_JOIN_WELCOME_HEADING = 'Welcome to the family!';
export const FAMILY_JOIN_REDIRECTING_COPY = 'Redirecting you to your family page...';
