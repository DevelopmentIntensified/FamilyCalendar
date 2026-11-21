/**
 * The `/family/join/[code]` page's rules: which face shows (unusable vs join),
 * the welcome beat and the copy that names all three reasons without guessing.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	FAMILY_JOIN_NETWORK_FAILURE,
	FAMILY_JOIN_REDIRECT_MS,
	FAMILY_JOIN_REDIRECTING_COPY,
	FAMILY_JOIN_RETRY_NOTE,
	FAMILY_JOIN_UNUSABLE_ADVICE,
	FAMILY_JOIN_UNUSABLE_BODY,
	FAMILY_JOIN_UNUSABLE_HEADING,
	FAMILY_JOIN_WELCOME_HEADING,
	familyJoinView
} from './family.join.rules';

const FAMILY = { id: 'fam-1', name: 'Rivera Home', color: '#c45e38' };

describe('familyJoinView', () => {
	it('explains an unusable link in place (issue 124)', () => {
		expect(familyJoinView({ invalid: true, family: null })).toBe('unusable');
	});

	it('offers the join when the code still works', () => {
		expect(familyJoinView({ invalid: false, family: FAMILY })).toBe('join');
	});

	it('treats a missing family as unusable even when the flag says otherwise', () => {
		expect(familyJoinView({ invalid: false, family: null })).toBe('unusable');
	});
});

describe('the approved copy', () => {
	it('names all three possible reasons and guesses none', () => {
		expect(FAMILY_JOIN_UNUSABLE_HEADING).toBe("This invite link isn't valid any more");
		// Legacy copy, verbatim: `src/routes/(marketing)/family/join/[code]/+page.svelte:66-68`
		// at 66a11131 — "The link may have expired, it may have been revoked, or every
		// use of it may already have been taken."
		expect(FAMILY_JOIN_UNUSABLE_BODY).toContain('The link may have expired');
		expect(FAMILY_JOIN_UNUSABLE_BODY).toContain('revoked');
		expect(FAMILY_JOIN_UNUSABLE_BODY).toContain('every use of it may already have been taken');
	});

	it('sends the person back to whoever invited them', () => {
		expect(FAMILY_JOIN_UNUSABLE_ADVICE).toContain('send you a new link');
	});

	it('welcome, redirecting and refusal-note lines are the page\'s own', () => {
		expect(FAMILY_JOIN_WELCOME_HEADING).toBe('Welcome to the family!');
		expect(FAMILY_JOIN_REDIRECTING_COPY).toBe('Redirecting you to your family page...');
		expect(FAMILY_JOIN_RETRY_NOTE).toBe('If this keeps happening, ask for a fresh invite link.');
		expect(FAMILY_JOIN_NETWORK_FAILURE).toBe(
			'We could not reach the server. Check your connection and try again.'
		);
	});

	it('leaves the welcome up for a beat before the redirect', () => {
		expect(FAMILY_JOIN_REDIRECT_MS).toBe(1500);
	});
});
