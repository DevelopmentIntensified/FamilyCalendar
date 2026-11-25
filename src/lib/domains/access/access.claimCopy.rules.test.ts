/**
 * The `/claim` screen's copy: the strings legacy showed, word for word.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import * as copy from './access.claimCopy.rules';

describe('claim screen copy', () => {
	it.each([
		['CLAIM_HEADING', 'Save your calendar'],
		['CLAIM_EMAIL_LABEL', 'Email address'],
		['CLAIM_EMAIL_PLACEHOLDER', 'you@example.com'],
		['CLAIM_SUBMIT', 'Email me a save link'],
		['CLAIM_BUSY', 'Sending...'],
		['CLAIM_SENT_PREFIX', 'Check'],
		['CLAIM_SENT_SUFFIX', 'for a link to save your calendar. It expires in 15 minutes.'],
		['CLAIM_LOGIN_QUESTION', 'Already have an account with this email?'],
		['CLAIM_LOGIN_LINK', 'Log in with my password & merge my calendar'],
		['CLAIM_BACK_LINK', 'Not now — back to my calendar']
	] as const)('%s', (name, expected) => {
		expect(copy[name]).toBe(expected);
	});

	it('states the 90-day deletion rule in the body', () => {
		expect(copy.CLAIM_BODY).toContain('deleted after 90 days of inactivity');
	});
});
