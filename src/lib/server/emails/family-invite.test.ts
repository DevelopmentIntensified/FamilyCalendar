import { describe, it, expect } from 'vitest';
import { getFamilyInviteEmailHtml } from './family-invite';

/**
 * Issue 091 — a real family-invite email template, tested without sending.
 * The route used to build its HTML inline inside the handler; this module holds
 * the copy so it can be asserted on its own, and the route renders it through
 * an injected seam (the magic-link service's dependency pattern).
 */
const URL = 'https://test.familyplanz.com/family/invite/email?token=tok-1';

describe('family invite email template', () => {
	it('names the inviter', () => {
		expect(getFamilyInviteEmailHtml({ inviterName: 'Ann Admin', inviteUrl: URL })).toContain(
			'Ann Admin'
		);
	});

	it('carries the minted invite link as a real anchor, not bare text', () => {
		const html = getFamilyInviteEmailHtml({ inviterName: 'Ann', inviteUrl: URL });

		expect(html).toContain(`href="${URL}"`);
	});

	it('says how long the link lives', () => {
		expect(getFamilyInviteEmailHtml({ inviterName: 'Ann', inviteUrl: URL })).toMatch(
			/expires in 24 hours/i
		);
	});

	it('tells a stranger they can ignore the mail if it was not meant for them', () => {
		expect(getFamilyInviteEmailHtml({ inviterName: 'Ann', inviteUrl: URL })).toMatch(
			/ignore/i
		);
	});
});
