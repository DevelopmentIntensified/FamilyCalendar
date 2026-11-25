/**
 * access `/claim` screen's copy: the "Save your calendar" card, the sent
 * confirmation, the login question and the way back.
 *
 * Its own file, not part of `access.auth.rules`, for ADR 0010: Rollup ships a
 * module's used exports as one chunk, and `/claim` must not download the
 * login, signup and recovery copy to show these eleven strings.
 *
 * Doc: ./README.md#invariants
 */

export const CLAIM_HEADING = 'Save your calendar';
export const CLAIM_BODY =
	'Add an email to sync your calendar across devices. Without it, your data stays on this device and is deleted after 90 days of inactivity.';
export const CLAIM_EMAIL_LABEL = 'Email address';
export const CLAIM_EMAIL_PLACEHOLDER = 'you@example.com';
export const CLAIM_SUBMIT = 'Email me a save link';
export const CLAIM_BUSY = 'Sending...';
export const CLAIM_SENT_PREFIX = 'Check';
export const CLAIM_SENT_SUFFIX = 'for a link to save your calendar. It expires in 15 minutes.';
export const CLAIM_LOGIN_QUESTION = 'Already have an account with this email?';
export const CLAIM_LOGIN_LINK = 'Log in with my password & merge my calendar';
export const CLAIM_BACK_LINK = 'Not now — back to my calendar';
